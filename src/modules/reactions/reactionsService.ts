import { Injectable } from '@nestjs/common'
import type { ReactionType } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { NotificationsRepository } from '../notifications/notificationsRepository.ts'
import { PostsRepository } from '../posts/postsRepository.ts'
import { ReactionsRepository } from './reactionsRepository.ts'

@Injectable()
export class ReactionsService {
  constructor(
    private readonly repository: ReactionsRepository,
    private readonly postsRepository: PostsRepository,
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  /** 같은 종류를 다시 누르면 취소, 다른 종류면 교체된다. */
  async put(viewerId: string, postId: string, type: ReactionType) {
    await this.requireVisiblePost(viewerId, postId)
    const existing = await this.repository.find(postId, viewerId)

    if (existing?.type === type) {
      await this.repository.remove(postId, viewerId)
      await this.notificationsRepository.removeByTarget('reaction', postId, viewerId)
      return this.summarize(postId, viewerId)
    }

    await this.repository.upsert(postId, viewerId, type)
    // 종류를 바꾼 경우 알림이 두 줄 쌓이지 않도록 이전 것을 지우고 다시 넣는다.
    await this.notificationsRepository.removeByTarget('reaction', postId, viewerId)
    const post = await this.postsRepository.findPost(postId)
    if (post !== undefined) {
      await this.notificationsRepository.insert({
        userId: post.authorId,
        actorId: viewerId,
        type: 'reaction',
        targetType: 'post',
        targetId: postId,
      })
    }
    return this.summarize(postId, viewerId)
  }

  async remove(viewerId: string, postId: string) {
    await this.requireVisiblePost(viewerId, postId)
    await this.repository.remove(postId, viewerId)
    await this.notificationsRepository.removeByTarget('reaction', postId, viewerId)
    return this.summarize(postId, viewerId)
  }

  private async summarize(postId: string, viewerId: string) {
    const stats = await this.postsRepository.loadStats([postId], viewerId)
    const entry = stats.get(postId)
    return {
      total: entry?.reactionTotal ?? 0,
      counts: entry?.reactionCounts ?? [],
      mine: entry?.myReaction ?? null,
    }
  }

  private async requireVisiblePost(viewerId: string, postId: string): Promise<void> {
    if (!(await this.postsRepository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
  }
}
