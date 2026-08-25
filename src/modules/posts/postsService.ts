import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Injectable } from '@nestjs/common'
import { env } from '../../config/env.ts'
import type { Frame, Post, PostVisibility, Template } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import { MediaRepository } from '../media/mediaRepository.ts'
import { MediaService } from '../media/mediaService.ts'
import {
  encodePinnedSortKey,
  type PostStats,
  PostsRepository,
  type PostWithRelations,
} from './postsRepository.ts'

export interface CutInput {
  cutIndex: number
  mediaId: string
}

const emptyStats: PostStats = {
  commentCount: 0,
  reactionTotal: 0,
  reactionCounts: [],
  myReaction: null,
  bookmarked: false,
}

/**
 * 장식 그림 주소. DB에는 파일 이름만 있고 URL은 읽는 시점에 만든다 — 미디어와 같은 규칙이라
 * `PUBLIC_BASE_URL`이 바뀌어도 기존 행이 따라온다.
 */
function frameAssetUrl(asset: string | null): string | null {
  return asset === null ? null : `${env.PUBLIC_BASE_URL}/frames/assets/${asset}`
}

/**
 * 장식 그림이 놓인 곳. 저장소가 아니라 **소스와 함께 배포되는 자산**이라 `STORAGE_DIR`과
 * 분리한다. `pnpm dev`와 `node dist/main.js` 둘 다 저장소 루트에서 도므로 cwd 기준이다.
 */
const FRAME_ASSETS_DIR = resolve(process.cwd(), 'assets/frames')

/** 경로 조작 차단. 시드가 넣는 이름만 통과한다 — 사용자 입력이 파일 경로가 되면 안 된다. */
const FRAME_ASSET_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/

function toFrameView(frame: Frame) {
  return {
    id: frame.id,
    code: frame.code,
    name: frame.name,
    background: frame.background,
    foreground: frame.foreground,
    padding: frame.padding,
    gutter: frame.gutter,
    cellRadius: frame.cellRadius,
    footer: frame.footer,
    decorTopUrl: frameAssetUrl(frame.decorTopAsset),
    decorBottomUrl: frameAssetUrl(frame.decorBottomAsset),
    patternUrl: frameAssetUrl(frame.patternAsset),
    patternScale: frame.patternScale,
  }
}

function toTemplateView(template: Template) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    cutCount: template.cutCount,
    aspectRatio: template.aspectRatio,
    slots: template.slots,
  }
}

@Injectable()
export class PostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly mediaService: MediaService,
  ) {}

  async listTemplates() {
    const items = await this.repository.listTemplates()
    return { items: items.map(toTemplateView) }
  }

  async listFrames() {
    const items = await this.repository.listFrames()
    return { items: items.map(toFrameView) }
  }

  /**
   * 장식 그림 바이트. 이름이 곧 파일이라 정규식으로 먼저 막고, 없는 파일은 404로 떨어뜨린다.
   * 미디어와 달리 소유자가 없어 인증을 요구하지 않는다 — 프레임 목록 자체가 모두에게 같다.
   */
  async readFrameAsset(name: string): Promise<Buffer> {
    if (!FRAME_ASSET_NAME.test(name)) {
      throw AppError.notFound('FRAME_ASSET_NOT_FOUND', '프레임 장식을 찾을 수 없습니다.')
    }
    try {
      return await readFile(resolve(FRAME_ASSETS_DIR, name))
    } catch {
      throw AppError.notFound('FRAME_ASSET_NOT_FOUND', '프레임 장식을 찾을 수 없습니다.')
    }
  }

  async createDraft(authorId: string, templateId: string) {
    await this.requireTemplate(templateId)
    const draft = await this.repository.createDraft(authorId, templateId)
    if (draft === undefined) {
      throw AppError.conflict('DRAFT_ALREADY_EXISTS', '이전 포스트 완료 후 생성할 수 있어요.')
    }
    return this.loadOne(draft.id, authorId)
  }

  async getDraft(authorId: string) {
    const draft = await this.repository.findDraft(authorId)
    if (draft === undefined) {
      throw AppError.notFound('DRAFT_NOT_FOUND', '작성 중인 포스트가 없습니다.')
    }
    return this.loadOne(draft.id, authorId)
  }

  async updateDraft(
    postId: string,
    authorId: string,
    values: {
      templateId?: string
      caption?: string | null
      visibility?: PostVisibility
      thumbnailCutIndex?: number | null
      pinned?: boolean
      frameId?: string | null
      cuts?: CutInput[]
    },
  ) {
    const post = await this.requireOwnPost(postId, authorId)
    const { cuts, ...rest } = values
    /* 발행된 포스트는 **대표 컷과 고정만** 바꿀 수 있다(§6.3, #13). 다른 필드가 하나라도 섞이면
     * draft 규칙 그대로 거절한다 — 발행본의 캡션·컷·공개 범위는 편집 대상이 아니다.
     * 발행 시 미지정을 0으로 채우므로(`publish`) 발행 뒤의 null도 0으로 — 발행본은 항상 non-null. */
    if (post.status !== 'draft') {
      const editable = new Set(['thumbnailCutIndex', 'pinned'])
      const keys = Object.keys(values)
      if (keys.length === 0 || keys.some((key) => !editable.has(key))) {
        throw AppError.badRequest(
          'POST_NOT_DRAFT',
          '발행된 포스트는 대표 컷과 고정만 바꿀 수 있습니다.',
        )
      }
      if (values.thumbnailCutIndex === null) rest.thumbnailCutIndex = 0
    }
    const template = await this.requireTemplate(values.templateId ?? post.templateId)

    // null은 선택 해제라 검사할 프레임이 없다. 서버가 기본 외형으로 치환하지 않는다.
    if (rest.frameId != null) await this.requireFrame(rest.frameId)
    if (cuts !== undefined) {
      await this.validateCuts(cuts, template, authorId)
    }
    if (rest.thumbnailCutIndex != null && rest.thumbnailCutIndex >= template.cutCount) {
      throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
    }

    if (Object.keys(rest).length > 0) await this.repository.update(postId, rest)
    if (cuts !== undefined) await this.repository.replaceCuts(postId, cuts)
    return this.loadOne(postId, authorId)
  }

  /** 컷이 다 찼는지, 합성본이 올라왔는지 확인하고 나서야 발행한다. */
  async publish(
    postId: string,
    authorId: string,
    values: {
      composedMediaId: string
      motionMediaId?: string
      caption?: string | null
      visibility?: PostVisibility
      thumbnailCutIndex?: number
      pinned?: boolean
    },
  ) {
    const post = await this.requireOwnDraft(postId, authorId)
    const template = await this.requireTemplate(post.templateId)

    const cuts = await this.repository.listCuts(postId)
    if (cuts.length !== template.cutCount) {
      throw AppError.badRequest(
        'CUTS_INCOMPLETE',
        `컷 ${template.cutCount}장을 모두 채워야 발행할 수 있습니다.`,
      )
    }

    const [composed] = await this.mediaRepository.findReadyByIds([values.composedMediaId], authorId)
    if (composed === undefined || composed.kind !== 'composed') {
      throw AppError.badRequest('MEDIA_NOT_READY', '합성본 업로드가 끝나지 않았습니다.')
    }

    /* 영상은 선택이지만, **보냈다면** 준비된 자기 영상이어야 한다. 조용히 무시하면 QR을 열었을
     * 때만 없다는 걸 알게 된다 — 그때는 다시 찍는 것 말고 할 수 있는 일이 없다. */
    if (values.motionMediaId !== undefined) {
      const [motion] = await this.mediaRepository.findReadyByIds([values.motionMediaId], authorId)
      if (motion === undefined || motion.kind !== 'motion') {
        throw AppError.badRequest('MEDIA_NOT_READY', '촬영 영상 업로드가 끝나지 않았습니다.')
      }
    }

    // 미지정 시 첫 컷이 대표가 된다 (명세 §6.3).
    const thumbnailCutIndex = values.thumbnailCutIndex ?? post.thumbnailCutIndex ?? 0
    if (thumbnailCutIndex >= template.cutCount) {
      throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
    }

    await this.repository.publish(postId, {
      composedMediaId: values.composedMediaId,
      motionMediaId: values.motionMediaId ?? post.motionMediaId,
      thumbnailCutIndex,
      // 고정은 발행 요청이 말한 대로, 없으면 draft에 있던 값(대표 컷을 고르며 미리 켰을 수 있다).
      pinned: values.pinned ?? post.pinned,
      caption: values.caption ?? post.caption,
      visibility: values.visibility ?? post.visibility,
    })
    return this.loadOne(postId, authorId)
  }

  async remove(postId: string, authorId: string): Promise<void> {
    const post = await this.repository.findPost(postId)
    if (post === undefined || post.authorId !== authorId) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    await this.repository.softDelete(postId)
  }

  async getPost(viewerId: string, postId: string) {
    if (!(await this.repository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    return this.loadOne(postId, viewerId)
  }

  /** 비공개 포스트는 링크를 만들지 않는다 (명세 §7.1). */
  async getShareLink(viewerId: string, postId: string) {
    if (!(await this.repository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    const post = await this.repository.findPost(postId)
    if (post === undefined || post.status !== 'published') {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    if (post.visibility === 'private') {
      throw AppError.forbidden('POST_NOT_SHAREABLE', '비공개 포스트는 공유할 수 없습니다.')
    }
    // 웹 랜딩이 생기기 전까지는 API 호스트를 그대로 쓴다.
    return { url: `${env.PUBLIC_BASE_URL}/p/${postId}` }
  }

  /** 보관 목록. 커서 키가 보관한 시각이라 `listPage`와 나눠 둔다. */
  async listBookmarked(viewerId: string, { cursor, limit }: CursorQuery) {
    const rows = await this.repository.listBookmarkedPostIds(viewerId, { cursor, limit })
    const page = toPage(
      rows,
      limit,
      (row) => row.id,
      (row) => encodeCursor(row.bookmarkedAt.toISOString(), row.id),
    )
    const posts = await this.loadInOrder(page.items)
    return { items: await this.toViews(posts, viewerId), nextCursor: page.nextCursor }
  }

  feed(viewerId: string, page: CursorQuery) {
    return this.listPage(viewerId, page)
  }

  listByAuthor(viewerId: string, authorId: string, page: CursorQuery) {
    return this.listPage(viewerId, page, authorId)
  }

  private toView(post: PostWithRelations, stats: PostStats = emptyStats) {
    return {
      id: post.id,
      author: {
        id: post.author.id,
        nickname: post.author.nickname,
        avatarUrl:
          post.author.avatar === null ? null : this.mediaService.toView(post.author.avatar).url,
      },
      template: toTemplateView(post.template),
      frame: post.frame === null ? null : toFrameView(post.frame),
      status: post.status,
      visibility: post.visibility,
      caption: post.caption,
      thumbnailCutIndex: post.thumbnailCutIndex,
      pinned: post.pinned,
      cuts: post.cuts.map((cut) => ({
        cutIndex: cut.cutIndex,
        media: this.mediaService.toView(cut.media),
      })),
      composed: post.composed === null ? null : this.mediaService.toView(post.composed),
      motion: post.motion === null ? null : this.mediaService.toView(post.motion),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      commentCount: stats.commentCount,
      reactions: {
        total: stats.reactionTotal,
        counts: stats.reactionCounts,
        mine: stats.myReaction,
      },
      bookmarked: stats.bookmarked,
    }
  }

  /** 목록·단건 모두 같은 모양으로 나가도록 집계를 한 번에 붙인다. */
  private async toViews(posts: PostWithRelations[], viewerId: string) {
    const stats = await this.repository.loadStats(
      posts.map((post) => post.id),
      viewerId,
    )
    return posts.map((post) => this.toView(post, stats.get(post.id)))
  }

  /** id 순서를 유지한 채 관계를 붙인다. `loadPosts`는 정렬을 보장하지 않는다. */
  private async loadInOrder(postIds: string[]) {
    const loaded = await this.repository.loadPosts(postIds)
    const byId = new Map(loaded.map((post) => [post.id, post]))
    return postIds.map((id) => byId.get(id)).filter((post) => post !== undefined)
  }

  private async loadOne(postId: string, viewerId: string) {
    const [view] = await this.toViews(await this.loadInOrder([postId]), viewerId)
    if (view === undefined) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    return view
  }

  private async listPage(
    viewerId: string,
    { cursor, limit }: CursorQuery,
    authorId?: string,
  ): Promise<Page<ReturnType<PostsService['toView']>>> {
    const rows = await this.repository.listVisiblePostIds(viewerId, {
      authorId,
      cursor,
      limit,
    })
    // 커서 키는 리포지토리의 정렬과 짝이 맞아야 한다 — 프로필 목록은 고정이 정렬 키에 들어간다.
    const page = toPage(
      rows,
      limit,
      (row) => row.id,
      (row) =>
        authorId === undefined
          ? encodeCursor(row.publishedAt?.toISOString() ?? '', row.id)
          : encodeCursor(encodePinnedSortKey(row.pinned, row.publishedAt), row.id),
    )
    const posts = await this.loadInOrder(page.items)
    return {
      items: await this.toViews(posts, viewerId),
      nextCursor: page.nextCursor,
    }
  }

  private async requireOwnPost(postId: string, authorId: string): Promise<Post> {
    const post = await this.repository.findPost(postId)
    if (post === undefined || post.authorId !== authorId) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    return post
  }

  private async requireOwnDraft(postId: string, authorId: string): Promise<Post> {
    const post = await this.requireOwnPost(postId, authorId)
    if (post.status !== 'draft') {
      throw AppError.badRequest('POST_NOT_DRAFT', '발행된 포스트는 편집할 수 없습니다.')
    }
    return post
  }

  private async requireFrame(frameId: string): Promise<Frame> {
    const frame = await this.repository.findFrame(frameId)
    if (frame === undefined) {
      throw AppError.badRequest('FRAME_NOT_FOUND', '프레임을 찾을 수 없습니다.')
    }
    return frame
  }

  private async requireTemplate(templateId: string): Promise<Template> {
    const template = await this.repository.findTemplate(templateId)
    if (template === undefined) {
      throw AppError.badRequest('TEMPLATE_NOT_FOUND', '템플릿을 찾을 수 없습니다.')
    }
    return template
  }

  /** 컷은 내 것이면서 업로드가 끝난 이미지여야 하고, 자리 번호가 템플릿 범위 안에서 겹치지 않아야 한다. */
  private async validateCuts(cuts: CutInput[], template: Template, ownerId: string) {
    const indexes = new Set(cuts.map((cut) => cut.cutIndex))
    if (indexes.size !== cuts.length) {
      throw AppError.badRequest('DUPLICATE_CUT_INDEX', '같은 자리에 두 컷을 넣을 수 없습니다.')
    }
    if (cuts.some((cut) => cut.cutIndex >= template.cutCount)) {
      throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
    }

    // iOS의 Swift UUID는 대문자로 직렬화되고 DB는 소문자를 돌려준다 — 소문자로 맞춰 비교한다.
    const mediaIds = cuts.map((cut) => cut.mediaId.toLowerCase())
    const ready = await this.mediaRepository.findReadyByIds(mediaIds, ownerId)
    const readyIds = new Set(ready.filter((row) => row.kind === 'cut').map((row) => row.id))
    if (mediaIds.some((id) => !readyIds.has(id))) {
      throw AppError.badRequest('MEDIA_NOT_READY', '업로드가 끝나지 않은 컷이 있습니다.')
    }
  }
}
