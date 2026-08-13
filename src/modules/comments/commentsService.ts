import { AppError } from '../../shared/errors/appError.ts'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import type { NotificationsRepository } from '../notifications/notificationsRepository.ts'
import type { PostsRepository } from '../posts/postsRepository.ts'
import type { CommentsRepository, CommentWithAuthor } from './commentsRepository.ts'

export function createCommentsService(
  repository: CommentsRepository,
  postsRepository: PostsRepository,
  notificationsRepository: NotificationsRepository,
  storage: StorageService,
) {
  function toView(row: CommentWithAuthor) {
    return {
      id: row.id,
      author: {
        id: row.author.id,
        nickname: row.author.nickname,
        avatarUrl: row.author.avatar === null ? null : storage.url(row.author.avatar.storageKey),
      },
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }
  }

  /** 볼 수 없는 포스트에는 댓글도 달 수 없고 목록도 열리지 않는다. */
  async function requireVisiblePost(viewerId: string, postId: string) {
    if (!(await postsRepository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
  }

  return {
    async create(viewerId: string, postId: string, body: string) {
      await requireVisiblePost(viewerId, postId)
      const post = await postsRepository.findPost(postId)
      if (post === undefined) {
        throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
      }

      const comment = await repository.create({ postId, authorId: viewerId, body })
      await notificationsRepository.insert({
        userId: post.authorId,
        actorId: viewerId,
        type: 'comment',
        targetType: 'post',
        targetId: postId,
      })

      const created = await repository.findWithAuthor(comment.id)
      if (created === undefined) throw new Error('방금 만든 댓글을 찾을 수 없습니다.')
      return toView(created)
    },

    async list(
      viewerId: string,
      postId: string,
      page: CursorQuery,
    ): Promise<Page<ReturnType<typeof toView>>> {
      await requireVisiblePost(viewerId, postId)
      const rows = await repository.list(postId, page)
      return toPage(rows, page.limit, toView, (row) =>
        encodeCursor(row.createdAt.toISOString(), row.id),
      )
    },

    /** 댓글 작성자와 포스트 작성자가 지울 수 있다. */
    async remove(viewerId: string, postId: string, commentId: string): Promise<void> {
      const comment = await repository.findById(commentId)
      if (comment === undefined || comment.postId !== postId) {
        throw AppError.notFound('COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.')
      }
      const post = await postsRepository.findPost(postId)
      if (comment.authorId !== viewerId && post?.authorId !== viewerId) {
        throw AppError.forbidden('COMMENT_FORBIDDEN', '댓글을 삭제할 권한이 없습니다.')
      }
      await repository.softDelete(commentId)
    },
  }
}
