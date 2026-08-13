import { Inject, Injectable } from '@nestjs/common'
import { AppError } from '../../shared/errors/appError.ts'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import { NotificationsRepository } from '../notifications/notificationsRepository.ts'
import { PostsRepository } from '../posts/postsRepository.ts'
import type { CommentWithAuthor } from './commentsRepository.ts'
import { CommentsRepository } from './commentsRepository.ts'

export interface CommentView {
  id: string
  author: { id: string; nickname: string | null; avatarUrl: string | null }
  body: string
  createdAt: string
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly repository: CommentsRepository,
    private readonly postsRepository: PostsRepository,
    private readonly notificationsRepository: NotificationsRepository,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  async create(viewerId: string, postId: string, body: string): Promise<CommentView> {
    await this.requireVisiblePost(viewerId, postId)
    const post = await this.postsRepository.findPost(postId)
    if (post === undefined) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }

    const comment = await this.repository.create({ postId, authorId: viewerId, body })
    await this.notificationsRepository.insert({
      userId: post.authorId,
      actorId: viewerId,
      type: 'comment',
      targetType: 'post',
      targetId: postId,
    })

    const created = await this.repository.findWithAuthor(comment.id)
    if (created === undefined) throw new Error('방금 만든 댓글을 찾을 수 없습니다.')
    return this.toView(created)
  }

  async list(viewerId: string, postId: string, page: CursorQuery): Promise<Page<CommentView>> {
    await this.requireVisiblePost(viewerId, postId)
    const rows = await this.repository.list(postId, page)
    return toPage(
      rows,
      page.limit,
      (row) => this.toView(row),
      (row) => encodeCursor(row.createdAt.toISOString(), row.id),
    )
  }

  /** 댓글 작성자와 포스트 작성자가 지울 수 있다. */
  async remove(viewerId: string, postId: string, commentId: string): Promise<void> {
    const comment = await this.repository.findById(commentId)
    if (comment === undefined || comment.postId !== postId) {
      throw AppError.notFound('COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.')
    }
    const post = await this.postsRepository.findPost(postId)
    if (comment.authorId !== viewerId && post?.authorId !== viewerId) {
      throw AppError.forbidden('COMMENT_FORBIDDEN', '댓글을 삭제할 권한이 없습니다.')
    }
    await this.repository.softDelete(commentId)
  }

  private toView(row: CommentWithAuthor): CommentView {
    return {
      id: row.id,
      author: {
        id: row.author.id,
        nickname: row.author.nickname,
        avatarUrl:
          row.author.avatar === null ? null : this.storage.url(row.author.avatar.storageKey),
      },
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }
  }

  /** 볼 수 없는 포스트에는 댓글도 달 수 없고 목록도 열리지 않는다. */
  private async requireVisiblePost(viewerId: string, postId: string): Promise<void> {
    if (!(await this.postsRepository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
  }
}
