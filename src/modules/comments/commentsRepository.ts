import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import { type Comment, comments, type Media, type User } from '../../db/schema/index.ts'
import { decodeCursor } from '../../shared/pagination/cursor.ts'

export type CommentWithAuthor = Comment & { author: User & { avatar: Media | null } }

@Injectable()
export class CommentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(values: { postId: string; authorId: string; body: string }): Promise<Comment> {
    const [row] = await this.db.insert(comments).values(values).returning()
    if (row === undefined) throw new Error('댓글 저장에 실패했습니다.')
    return row
  }

  findById(commentId: string): Promise<Comment | undefined> {
    return this.db.query.comments.findFirst({
      where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    })
  }

  findWithAuthor(commentId: string): Promise<CommentWithAuthor | undefined> {
    return this.db.query.comments.findFirst({
      where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
      with: { author: { with: { avatar: true } } },
    })
  }

  /** 대화 흐름대로 읽도록 오래된 것부터 준다. 커서도 같은 방향이다. */
  list(
    postId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<CommentWithAuthor[]> {
    const conditions = [eq(comments.postId, postId), isNull(comments.deletedAt)]
    if (cursor !== undefined) {
      const [createdAt, id] = decodeCursor(cursor)
      conditions.push(
        sql`(${comments.createdAt}, ${comments.id}) > (${createdAt}::timestamptz, ${id}::uuid)`,
      )
    }
    return this.db.query.comments.findMany({
      where: and(...conditions),
      with: { author: { with: { avatar: true } } },
      orderBy: [asc(comments.createdAt), asc(comments.id)],
      limit: limit + 1,
    })
  }

  async softDelete(commentId: string): Promise<void> {
    await this.db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId))
  }
}
