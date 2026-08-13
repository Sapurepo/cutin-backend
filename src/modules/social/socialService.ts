import { AppError } from '../../shared/errors/appError.ts'
import type { Page } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import type { NotificationsRepository } from '../notifications/notificationsRepository.ts'
import type { PublicUserRow, SocialRepository, UserWithAvatar } from './socialRepository.ts'

export interface PublicUser {
  id: string
  nickname: string | null
  avatarUrl: string | null
}

export interface PublicProfile extends PublicUser {
  friendCount: number
  following: boolean
  followedBy: boolean
  friend: boolean
  blocking: boolean
}

export function createSocialService(
  repository: SocialRepository,
  notificationsRepository: NotificationsRepository,
  storage: StorageService,
) {
  function toPublicUser(row: PublicUserRow): PublicUser {
    return {
      id: row.id,
      nickname: row.nickname,
      avatarUrl: row.avatarKey === null ? null : storage.url(row.avatarKey),
    }
  }

  function toPublicUserPage(page: Page<PublicUserRow>): Page<PublicUser> {
    return { items: page.items.map(toPublicUser), nextCursor: page.nextCursor }
  }

  /**
   * 상대가 나를 차단했다면 존재 자체를 숨긴다.
   * 내가 상대를 차단한 경우는 차단 해제를 할 수 있어야 하므로 숨기지 않고 상태만 알려준다.
   */
  async function requireVisibleTarget(
    viewerId: string,
    targetId: string,
  ): Promise<{ target: UserWithAvatar; blocking: boolean }> {
    if (viewerId === targetId) {
      throw AppError.badRequest('SELF_NOT_ALLOWED', '자기 자신에게는 할 수 없는 동작입니다.')
    }
    const target = await repository.findActiveUser(targetId)
    if (target === undefined) {
      throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    const { blocking, blockedBy } = await repository.blockState(viewerId, targetId)
    if (blockedBy) throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    return { target, blocking }
  }

  return {
    async follow(
      viewerId: string,
      targetId: string,
    ): Promise<{ following: boolean; friend: boolean }> {
      const { blocking } = await requireVisibleTarget(viewerId, targetId)
      if (blocking) {
        throw AppError.forbidden('BLOCKED', '차단한 사용자는 팔로우할 수 없습니다.')
      }
      const { friend } = await repository.follow(viewerId, targetId)
      await notificationsRepository.insert({
        userId: targetId,
        actorId: viewerId,
        type: 'follow',
        targetType: 'user',
        targetId: viewerId,
      })
      return { following: true, friend }
    },

    async unfollow(viewerId: string, targetId: string): Promise<void> {
      await requireVisibleTarget(viewerId, targetId)
      await repository.unfollow(viewerId, targetId)
    },

    async block(viewerId: string, targetId: string): Promise<void> {
      if (viewerId === targetId) {
        throw AppError.badRequest('SELF_NOT_ALLOWED', '자기 자신은 차단할 수 없습니다.')
      }
      if ((await repository.findActiveUser(targetId)) === undefined) {
        throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
      }
      await repository.block(viewerId, targetId)
    },

    async unblock(viewerId: string, targetId: string): Promise<void> {
      await repository.unblock(viewerId, targetId)
    },

    async listFollowers(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
      return toPublicUserPage(await repository.listFollowers(viewerId, page))
    },

    async listFollowees(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
      return toPublicUserPage(await repository.listFollowees(viewerId, page))
    },

    async listFriends(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
      return toPublicUserPage(await repository.listFriends(viewerId, page))
    },

    async search(viewerId: string, keyword: string, page: CursorQuery): Promise<Page<PublicUser>> {
      return toPublicUserPage(await repository.search(viewerId, keyword, page))
    },

    async recommend(viewerId: string, limit: number) {
      const rows = await repository.recommend(viewerId, limit)
      return {
        items: rows.map((row) => ({
          ...toPublicUser(row),
          mutualFriendCount: row.mutualFriendCount,
        })),
      }
    },

    async getProfile(viewerId: string, targetId: string): Promise<PublicProfile> {
      const { target, blocking } = await requireVisibleTarget(viewerId, targetId)
      const [relation, friendCount] = await Promise.all([
        repository.relation(viewerId, targetId),
        repository.friendCount(targetId),
      ])
      return {
        id: target.id,
        nickname: target.nickname,
        avatarUrl: target.avatar === null ? null : storage.url(target.avatar.storageKey),
        friendCount,
        ...relation,
        blocking,
      }
    },
  }
}
