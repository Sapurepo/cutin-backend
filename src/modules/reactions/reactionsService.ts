import type { ReactionType } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import type { NotificationsRepository } from '../notifications/notificationsRepository.ts'
import type { PostsRepository } from '../posts/postsRepository.ts'
import type { ReactionsRepository } from './reactionsRepository.ts'

export function createReactionsService(
  repository: ReactionsRepository,
  postsRepository: PostsRepository,
  notificationsRepository: NotificationsRepository,
) {
  async function summarize(postId: string, viewerId: string) {
    const stats = await postsRepository.loadStats([postId], viewerId)
    const entry = stats.get(postId)
    return {
      total: entry?.reactionTotal ?? 0,
      counts: entry?.reactionCounts ?? [],
      mine: entry?.myReaction ?? null,
    }
  }

  async function requireVisiblePost(viewerId: string, postId: string) {
    if (!(await postsRepository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
  }

  return {
    /** 같은 종류를 다시 누르면 취소, 다른 종류면 교체된다. */
    async put(viewerId: string, postId: string, type: ReactionType) {
      await requireVisiblePost(viewerId, postId)
      const existing = await repository.find(postId, viewerId)

      if (existing?.type === type) {
        await repository.remove(postId, viewerId)
        await notificationsRepository.removeByTarget('reaction', postId, viewerId)
        return summarize(postId, viewerId)
      }

      await repository.upsert(postId, viewerId, type)
      // 종류를 바꾼 경우 알림이 두 줄 쌓이지 않도록 이전 것을 지우고 다시 넣는다.
      await notificationsRepository.removeByTarget('reaction', postId, viewerId)
      const post = await postsRepository.findPost(postId)
      if (post !== undefined) {
        await notificationsRepository.insert({
          userId: post.authorId,
          actorId: viewerId,
          type: 'reaction',
          targetType: 'post',
          targetId: postId,
        })
      }
      return summarize(postId, viewerId)
    },

    async remove(viewerId: string, postId: string) {
      await requireVisiblePost(viewerId, postId)
      await repository.remove(postId, viewerId)
      await notificationsRepository.removeByTarget('reaction', postId, viewerId)
      return summarize(postId, viewerId)
    },
  }
}
