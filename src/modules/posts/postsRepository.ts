import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import {
  bookmarks,
  comments,
  type Frame,
  frames,
  type Post,
  type PostCut,
  type PostVisibility,
  postCuts,
  posts,
  type ReactionType,
  reactions,
  type Template,
  templates,
} from '../../db/schema/index.ts'
import { decodeCursor } from '../../shared/pagination/cursor.ts'

export interface PageQuery {
  cursor?: string
  limit: number
}

export interface PostCursorRow {
  id: string
  publishedAt: Date | null
}

export interface PostStats {
  commentCount: number
  reactionTotal: number
  reactionCounts: { type: ReactionType; count: number }[]
  myReaction: ReactionType | null
  bookmarked: boolean
}

@Injectable()
export class PostsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * 본인 글은 항상 보이고, 남의 글은 발행된 것 중 차단이 없고 공개범위를 만족하는 것만 보인다.
   * 친구공개 판정은 `friendships` 파생 테이블만 본다.
   */
  private visibleToViewer(viewerId: string): SQL {
    return sql`(
      ${posts.authorId} = ${viewerId}::uuid
      or (
        ${posts.status} = 'published'
        and not exists (
          select 1 from blocks
          where (blocker_id = ${viewerId}::uuid and blocked_id = ${posts.authorId})
             or (blocker_id = ${posts.authorId} and blocked_id = ${viewerId}::uuid)
        )
        and (
          ${posts.visibility} = 'public'
          or (
            ${posts.visibility} = 'friends'
            and exists (
              select 1 from friendships
              where (user_id_low = ${viewerId}::uuid and user_id_high = ${posts.authorId})
                 or (user_id_high = ${viewerId}::uuid and user_id_low = ${posts.authorId})
            )
          )
        )
      )
    )`
  }

  listTemplates(): Promise<Template[]> {
    return this.db.query.templates.findMany({
      where: eq(templates.isActive, true),
      orderBy: [asc(templates.sortOrder), asc(templates.cutCount)],
    })
  }

  findTemplate(templateId: string): Promise<Template | undefined> {
    return this.db.query.templates.findFirst({
      where: and(eq(templates.id, templateId), eq(templates.isActive, true)),
    })
  }

  listFrames(): Promise<Frame[]> {
    return this.db.query.frames.findMany({
      where: eq(frames.isActive, true),
      orderBy: [asc(frames.sortOrder), asc(frames.code)],
    })
  }

  findFrame(frameId: string): Promise<Frame | undefined> {
    return this.db.query.frames.findFirst({
      where: and(eq(frames.id, frameId), eq(frames.isActive, true)),
    })
  }

  /** 부분 유니크 인덱스에 걸리면 아무것도 삽입되지 않는다. 즉 undefined는 "이미 draft가 있다"는 뜻이다. */
  async createDraft(authorId: string, templateId: string): Promise<Post | undefined> {
    const [row] = await this.db
      .insert(posts)
      .values({ authorId, templateId })
      .onConflictDoNothing()
      .returning()
    return row
  }

  findDraft(authorId: string): Promise<Post | undefined> {
    return this.db.query.posts.findFirst({
      where: and(eq(posts.authorId, authorId), eq(posts.status, 'draft')),
    })
  }

  findPost(postId: string): Promise<Post | undefined> {
    return this.db.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })
  }

  listCuts(postId: string): Promise<PostCut[]> {
    return this.db.query.postCuts.findMany({
      where: eq(postCuts.postId, postId),
      orderBy: [asc(postCuts.cutIndex)],
    })
  }

  async update(
    postId: string,
    values: {
      templateId?: string
      caption?: string | null
      visibility?: PostVisibility
      thumbnailCutIndex?: number | null
      pinned?: boolean
      frameId?: string | null
    },
  ): Promise<Post | undefined> {
    const [row] = await this.db
      .update(posts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(posts.id, postId))
      .returning()
    return row
  }

  /** 컷은 부분 수정하지 않고 통째로 갈아끼운다. 클라이언트가 항상 전체 상태를 보내기 때문이다. */
  async replaceCuts(postId: string, cuts: { cutIndex: number; mediaId: string }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(postCuts).where(eq(postCuts.postId, postId))
      if (cuts.length > 0) {
        await tx.insert(postCuts).values(cuts.map((cut) => ({ postId, ...cut })))
      }
    })
  }

  async publish(
    postId: string,
    values: {
      composedMediaId: string
      thumbnailCutIndex: number
      pinned: boolean
      caption: string | null
      visibility: PostVisibility
    },
  ): Promise<Post | undefined> {
    const now = new Date()
    const [row] = await this.db
      .update(posts)
      .set({ ...values, status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(posts.id, postId))
      .returning()
    return row
  }

  /** 삭제된 포스트의 보관은 의미가 없어 함께 지운다. 존재하지 않는 id가 쌓이지 않게 한다. */
  async softDelete(postId: string): Promise<void> {
    const now = new Date()
    await this.db.transaction(async (tx) => {
      await tx
        .update(posts)
        .set({ status: 'deleted', deletedAt: now, updatedAt: now })
        .where(eq(posts.id, postId))
      await tx.delete(bookmarks).where(eq(bookmarks.postId, postId))
    })
  }

  /**
   * 발행된 포스트를 최신순으로 훑는다. `authorId`를 주면 특정 사용자의 글만 본다.
   * 본문은 여기서 읽지 않고 id만 뽑은 뒤 `loadPosts`가 관계를 붙인다.
   */
  async listVisiblePostIds(
    viewerId: string,
    { authorId, cursor, limit }: PageQuery & { authorId?: string },
  ): Promise<PostCursorRow[]> {
    const conditions = [
      eq(posts.status, 'published'),
      isNull(posts.deletedAt),
      this.visibleToViewer(viewerId),
    ]
    if (authorId !== undefined) conditions.push(eq(posts.authorId, authorId))
    if (cursor !== undefined) {
      const [publishedAt, id] = decodeCursor(cursor)
      conditions.push(
        sql`(${posts.publishedAt}, ${posts.id}) < (${publishedAt}::timestamptz, ${id}::uuid)`,
      )
    }

    return this.db
      .select({ id: posts.id, publishedAt: posts.publishedAt })
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(limit + 1)
  }

  /**
   * 보관 목록. 정렬이 **보관한 시각** 최신순이라 `listVisiblePostIds`와 커서 키가 다르다.
   * 노출 판정은 같은 것을 쓴다 — 보관해 둔 뒤 친구가 끊기면 목록에서도 사라져야 한다.
   */
  async listBookmarkedPostIds(
    viewerId: string,
    { cursor, limit }: PageQuery,
  ): Promise<{ id: string; bookmarkedAt: Date }[]> {
    const conditions = [
      eq(bookmarks.userId, viewerId),
      eq(posts.status, 'published'),
      isNull(posts.deletedAt),
      this.visibleToViewer(viewerId),
    ]
    if (cursor !== undefined) {
      const [bookmarkedAt, id] = decodeCursor(cursor)
      conditions.push(
        sql`(${bookmarks.createdAt}, ${posts.id}) < (${bookmarkedAt}::timestamptz, ${id}::uuid)`,
      )
    }

    return this.db
      .select({ id: posts.id, bookmarkedAt: bookmarks.createdAt })
      .from(bookmarks)
      .innerJoin(posts, eq(posts.id, bookmarks.postId))
      .where(and(...conditions))
      .orderBy(desc(bookmarks.createdAt), desc(posts.id))
      .limit(limit + 1)
  }

  async isVisible(viewerId: string, postId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt), this.visibleToViewer(viewerId)))
      .limit(1)
    return row !== undefined
  }

  /**
   * 댓글·반응 집계. 상호작용 테이블을 읽지만 포스트를 그리는 데 필요한 값이라 여기 둔다.
   * 쓰기는 각 도메인 모듈(comments·reactions)이 담당한다.
   */
  async loadStats(postIds: string[], viewerId: string): Promise<Map<string, PostStats>> {
    const stats = new Map<string, PostStats>(
      postIds.map((id) => [
        id,
        {
          commentCount: 0,
          reactionTotal: 0,
          reactionCounts: [],
          myReaction: null,
          bookmarked: false,
        },
      ]),
    )
    if (postIds.length === 0) return stats

    const [commentRows, reactionRows, mineRows, bookmarkRows] = await Promise.all([
      this.db
        .select({ postId: comments.postId, value: count() })
        .from(comments)
        .where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
        .groupBy(comments.postId),
      this.db
        .select({ postId: reactions.postId, type: reactions.type, value: count() })
        .from(reactions)
        .where(inArray(reactions.postId, postIds))
        .groupBy(reactions.postId, reactions.type),
      this.db
        .select({ postId: reactions.postId, type: reactions.type })
        .from(reactions)
        .where(and(inArray(reactions.postId, postIds), eq(reactions.userId, viewerId))),
      this.db
        .select({ postId: bookmarks.postId })
        .from(bookmarks)
        .where(and(inArray(bookmarks.postId, postIds), eq(bookmarks.userId, viewerId))),
    ])

    for (const row of commentRows) {
      const entry = stats.get(row.postId)
      if (entry !== undefined) entry.commentCount = row.value
    }
    for (const row of reactionRows) {
      const entry = stats.get(row.postId)
      if (entry === undefined) continue
      entry.reactionCounts.push({ type: row.type, count: row.value })
      entry.reactionTotal += row.value
    }
    for (const row of mineRows) {
      const entry = stats.get(row.postId)
      if (entry !== undefined) entry.myReaction = row.type
    }
    for (const row of bookmarkRows) {
      const entry = stats.get(row.postId)
      if (entry !== undefined) entry.bookmarked = true
    }
    return stats
  }

  loadPosts(postIds: string[]) {
    if (postIds.length === 0) return Promise.resolve([])
    return this.db.query.posts.findMany({
      where: inArray(posts.id, postIds),
      with: {
        author: { with: { avatar: true } },
        template: true,
        frame: true,
        composed: true,
        cuts: { with: { media: true }, orderBy: [asc(postCuts.cutIndex)] },
      },
    })
  }
}

export type PostWithRelations = Awaited<ReturnType<PostsRepository['loadPosts']>>[number]
