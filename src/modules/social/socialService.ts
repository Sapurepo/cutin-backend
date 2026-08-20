import { Inject, Injectable } from '@nestjs/common'
import { AppError } from '../../shared/errors/appError.ts'
import type { Page } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import { NotificationsService } from '../notifications/notificationsService.ts'
import type { PublicUserRow, UserWithAvatar } from './socialRepository.ts'
import { SocialRepository } from './socialRepository.ts'

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

@Injectable()
export class SocialService {
  constructor(
    private readonly repository: SocialRepository,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  async follow(
    viewerId: string,
    targetId: string,
  ): Promise<{ following: boolean; friend: boolean }> {
    const { blocking } = await this.requireVisibleTarget(viewerId, targetId)
    if (blocking) {
      throw AppError.forbidden('BLOCKED', '차단한 사용자는 팔로우할 수 없습니다.')
    }
    const { friend } = await this.repository.follow(viewerId, targetId)
    await this.notifications.dispatch({
      userId: targetId,
      actorId: viewerId,
      type: 'follow',
      targetType: 'user',
      targetId: viewerId,
    })
    return { following: true, friend }
  }

  async unfollow(viewerId: string, targetId: string): Promise<void> {
    await this.requireVisibleTarget(viewerId, targetId)
    await this.repository.unfollow(viewerId, targetId)
  }

  async block(viewerId: string, targetId: string): Promise<void> {
    if (viewerId === targetId) {
      throw AppError.badRequest('SELF_NOT_ALLOWED', '자기 자신은 차단할 수 없습니다.')
    }
    if ((await this.repository.findActiveUser(targetId)) === undefined) {
      throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    await this.repository.block(viewerId, targetId)
  }

  async unblock(viewerId: string, targetId: string): Promise<void> {
    await this.repository.unblock(viewerId, targetId)
  }

  async listFollowers(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
    return this.toPublicUserPage(await this.repository.listFollowers(viewerId, page))
  }

  async listFollowees(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
    return this.toPublicUserPage(await this.repository.listFollowees(viewerId, page))
  }

  async listFriends(viewerId: string, page: CursorQuery): Promise<Page<PublicUser>> {
    return this.toPublicUserPage(await this.repository.listFriends(viewerId, page))
  }

  async search(viewerId: string, keyword: string, page: CursorQuery): Promise<Page<PublicUser>> {
    return this.toPublicUserPage(await this.repository.search(viewerId, keyword, page))
  }

  async recommend(viewerId: string, limit: number) {
    const rows = await this.repository.recommend(viewerId, limit)
    return {
      items: rows.map((row) => ({
        ...this.toPublicUser(row),
        mutualFriendCount: row.mutualFriendCount,
      })),
    }
  }

  async getProfile(viewerId: string, targetId: string): Promise<PublicProfile> {
    const { target, blocking } = await this.requireVisibleTarget(viewerId, targetId)
    const [relation, friendCount] = await Promise.all([
      this.repository.relation(viewerId, targetId),
      this.repository.friendCount(targetId),
    ])
    return {
      id: target.id,
      nickname: target.nickname,
      avatarUrl: target.avatar === null ? null : this.storage.url(target.avatar.storageKey),
      friendCount,
      ...relation,
      blocking,
    }
  }

  private toPublicUser(row: PublicUserRow): PublicUser {
    return {
      id: row.id,
      nickname: row.nickname,
      avatarUrl: row.avatarKey === null ? null : this.storage.url(row.avatarKey),
    }
  }

  private toPublicUserPage(page: Page<PublicUserRow>): Page<PublicUser> {
    return { items: page.items.map((row) => this.toPublicUser(row)), nextCursor: page.nextCursor }
  }

  /**
   * 상대가 나를 차단했다면 존재 자체를 숨긴다.
   * 내가 상대를 차단한 경우는 차단 해제를 할 수 있어야 하므로 숨기지 않고 상태만 알려준다.
   */
  private async requireVisibleTarget(
    viewerId: string,
    targetId: string,
  ): Promise<{ target: UserWithAvatar; blocking: boolean }> {
    if (viewerId === targetId) {
      throw AppError.badRequest('SELF_NOT_ALLOWED', '자기 자신에게는 할 수 없는 동작입니다.')
    }
    const target = await this.repository.findActiveUser(targetId)
    if (target === undefined) {
      throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    const { blocking, blockedBy } = await this.repository.blockState(viewerId, targetId)
    if (blockedBy) throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    return { target, blocking }
  }
}
