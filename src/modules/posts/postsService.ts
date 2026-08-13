import type { Post, PostVisibility, Template } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import type { MediaRepository } from '../media/mediaRepository.ts'
import type { MediaService } from '../media/mediaService.ts'
import type { PostStats, PostsRepository, PostWithRelations } from './postsRepository.ts'

export interface CutInput {
  cutIndex: number
  mediaId: string
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

export function createPostsService(
  repository: PostsRepository,
  mediaRepository: MediaRepository,
  mediaService: MediaService,
  /** 공유 딥링크의 앞부분. 웹 랜딩이 생기기 전까지는 API 호스트를 그대로 쓴다. */
  shareBaseUrl: string,
) {
  const emptyStats: PostStats = {
    commentCount: 0,
    reactionTotal: 0,
    reactionCounts: [],
    myReaction: null,
  }

  function toView(post: PostWithRelations, stats: PostStats = emptyStats) {
    return {
      id: post.id,
      author: {
        id: post.author.id,
        nickname: post.author.nickname,
        avatarUrl: post.author.avatar === null ? null : mediaService.toView(post.author.avatar).url,
      },
      template: toTemplateView(post.template),
      status: post.status,
      visibility: post.visibility,
      caption: post.caption,
      thumbnailCutIndex: post.thumbnailCutIndex,
      cuts: post.cuts.map((cut) => ({
        cutIndex: cut.cutIndex,
        media: mediaService.toView(cut.media),
      })),
      composed: post.composed === null ? null : mediaService.toView(post.composed),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      commentCount: stats.commentCount,
      reactions: {
        total: stats.reactionTotal,
        counts: stats.reactionCounts,
        mine: stats.myReaction,
      },
    }
  }

  /** 목록·단건 모두 같은 모양으로 나가도록 집계를 한 번에 붙인다. */
  async function toViews(posts: PostWithRelations[], viewerId: string) {
    const stats = await repository.loadStats(
      posts.map((post) => post.id),
      viewerId,
    )
    return posts.map((post) => toView(post, stats.get(post.id)))
  }

  /** id 순서를 유지한 채 관계를 붙인다. `loadPosts`는 정렬을 보장하지 않는다. */
  async function loadInOrder(postIds: string[]) {
    const loaded = await repository.loadPosts(postIds)
    const byId = new Map(loaded.map((post) => [post.id, post]))
    return postIds.map((id) => byId.get(id)).filter((post) => post !== undefined)
  }

  async function requireOwnDraft(postId: string, authorId: string): Promise<Post> {
    const post = await repository.findPost(postId)
    if (post === undefined || post.authorId !== authorId) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    if (post.status !== 'draft') {
      throw AppError.badRequest('POST_NOT_DRAFT', '발행된 포스트는 편집할 수 없습니다.')
    }
    return post
  }

  async function requireTemplate(templateId: string): Promise<Template> {
    const template = await repository.findTemplate(templateId)
    if (template === undefined) {
      throw AppError.badRequest('TEMPLATE_NOT_FOUND', '템플릿을 찾을 수 없습니다.')
    }
    return template
  }

  /** 컷은 내 것이면서 업로드가 끝난 이미지여야 하고, 자리 번호가 템플릿 범위 안에서 겹치지 않아야 한다. */
  async function validateCuts(cuts: CutInput[], template: Template, ownerId: string) {
    const indexes = new Set(cuts.map((cut) => cut.cutIndex))
    if (indexes.size !== cuts.length) {
      throw AppError.badRequest('DUPLICATE_CUT_INDEX', '같은 자리에 두 컷을 넣을 수 없습니다.')
    }
    if (cuts.some((cut) => cut.cutIndex >= template.cutCount)) {
      throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
    }

    const mediaIds = cuts.map((cut) => cut.mediaId)
    const ready = await mediaRepository.findReadyByIds(mediaIds, ownerId)
    const readyIds = new Set(ready.filter((row) => row.kind === 'cut').map((row) => row.id))
    if (mediaIds.some((id) => !readyIds.has(id))) {
      throw AppError.badRequest('MEDIA_NOT_READY', '업로드가 끝나지 않은 컷이 있습니다.')
    }
  }

  async function loadOne(postId: string, viewerId: string) {
    const [view] = await toViews(await loadInOrder([postId]), viewerId)
    if (view === undefined) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
    return view
  }

  async function listPage(
    viewerId: string,
    { cursor, limit }: CursorQuery,
    authorId?: string,
  ): Promise<Page<ReturnType<typeof toView>>> {
    const rows = await repository.listVisiblePostIds(viewerId, { authorId, cursor, limit })
    const page = toPage(
      rows,
      limit,
      (row) => row.id,
      (row) => encodeCursor(row.publishedAt?.toISOString() ?? '', row.id),
    )
    const posts = await loadInOrder(page.items)
    return { items: await toViews(posts, viewerId), nextCursor: page.nextCursor }
  }

  return {
    async listTemplates() {
      const items = await repository.listTemplates()
      return { items: items.map(toTemplateView) }
    },

    async createDraft(authorId: string, templateId: string) {
      await requireTemplate(templateId)
      const draft = await repository.createDraft(authorId, templateId)
      if (draft === undefined) {
        throw AppError.conflict('DRAFT_ALREADY_EXISTS', '이전 포스트 완료 후 생성할 수 있어요.')
      }
      return loadOne(draft.id, authorId)
    },

    async getDraft(authorId: string) {
      const draft = await repository.findDraft(authorId)
      if (draft === undefined) {
        throw AppError.notFound('DRAFT_NOT_FOUND', '작성 중인 포스트가 없습니다.')
      }
      return loadOne(draft.id, authorId)
    },

    async updateDraft(
      postId: string,
      authorId: string,
      values: {
        templateId?: string
        caption?: string | null
        visibility?: PostVisibility
        thumbnailCutIndex?: number | null
        cuts?: CutInput[]
      },
    ) {
      const post = await requireOwnDraft(postId, authorId)
      const { cuts, ...rest } = values
      const template = await requireTemplate(values.templateId ?? post.templateId)

      if (cuts !== undefined) {
        await validateCuts(cuts, template, authorId)
      }
      if (rest.thumbnailCutIndex != null && rest.thumbnailCutIndex >= template.cutCount) {
        throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
      }

      if (Object.keys(rest).length > 0) await repository.update(postId, rest)
      if (cuts !== undefined) await repository.replaceCuts(postId, cuts)
      return loadOne(postId, authorId)
    },

    /** 컷이 다 찼는지, 합성본이 올라왔는지 확인하고 나서야 발행한다. */
    async publish(
      postId: string,
      authorId: string,
      values: {
        composedMediaId: string
        caption?: string | null
        visibility?: PostVisibility
        thumbnailCutIndex?: number
      },
    ) {
      const post = await requireOwnDraft(postId, authorId)
      const template = await requireTemplate(post.templateId)

      const cuts = await repository.listCuts(postId)
      if (cuts.length !== template.cutCount) {
        throw AppError.badRequest(
          'CUTS_INCOMPLETE',
          `컷 ${template.cutCount}장을 모두 채워야 발행할 수 있습니다.`,
        )
      }

      const [composed] = await mediaRepository.findReadyByIds([values.composedMediaId], authorId)
      if (composed === undefined || composed.kind !== 'composed') {
        throw AppError.badRequest('MEDIA_NOT_READY', '합성본 업로드가 끝나지 않았습니다.')
      }

      // 미지정 시 첫 컷이 대표가 된다 (명세 §6.3).
      const thumbnailCutIndex = values.thumbnailCutIndex ?? post.thumbnailCutIndex ?? 0
      if (thumbnailCutIndex >= template.cutCount) {
        throw AppError.badRequest('CUT_INDEX_OUT_OF_RANGE', '템플릿의 컷 수를 넘는 자리입니다.')
      }

      await repository.publish(postId, {
        composedMediaId: values.composedMediaId,
        thumbnailCutIndex,
        caption: values.caption ?? post.caption,
        visibility: values.visibility ?? post.visibility,
      })
      return loadOne(postId, authorId)
    },

    async remove(postId: string, authorId: string): Promise<void> {
      const post = await repository.findPost(postId)
      if (post === undefined || post.authorId !== authorId) {
        throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
      }
      await repository.softDelete(postId)
    },

    async getPost(viewerId: string, postId: string) {
      if (!(await repository.isVisible(viewerId, postId))) {
        throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
      }
      return loadOne(postId, viewerId)
    },

    /** 비공개 포스트는 링크를 만들지 않는다 (명세 §7.1). */
    async getShareLink(viewerId: string, postId: string) {
      if (!(await repository.isVisible(viewerId, postId))) {
        throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
      }
      const post = await repository.findPost(postId)
      if (post === undefined || post.status !== 'published') {
        throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
      }
      if (post.visibility === 'private') {
        throw AppError.forbidden('POST_NOT_SHAREABLE', '비공개 포스트는 공유할 수 없습니다.')
      }
      return { url: `${shareBaseUrl}/p/${postId}` }
    },

    feed(viewerId: string, page: CursorQuery) {
      return listPage(viewerId, page)
    },

    listByAuthor(viewerId: string, authorId: string, page: CursorQuery) {
      return listPage(viewerId, page, authorId)
    },
  }
}
