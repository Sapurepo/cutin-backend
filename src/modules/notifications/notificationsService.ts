import { Inject, Injectable, Logger } from '@nestjs/common'
import type { NotificationType } from '../../db/schema/index.ts'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import { PUSH } from '../../shared/push/pushModule.ts'
import type { PushService } from '../../shared/push/pushService.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import { DevicesRepository } from '../devices/devicesRepository.ts'
import type { NotificationInput, NotificationWithActor } from './notificationsRepository.ts'
import { NotificationsRepository } from './notificationsRepository.ts'

/** 즉시 알림 문구. 리마인더성 문구는 잡이 따로 가진다. */
const bodies: Record<NotificationType, string> = {
  comment: '회원님의 포스트에 댓글을 남겼어요.',
  reaction: '회원님의 포스트에 반응했어요.',
  follow: '회원님을 팔로우하기 시작했어요.',
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly devicesRepository: DevicesRepository,
    @Inject(PUSH) private readonly push: PushService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  /**
   * 인앱 알림을 남기고 곧바로 푸시한다.
   * 댓글·반응·팔로우는 슬롯을 타지 않는다 (명세 §3.3 — 슬롯은 리마인더성 푸시만).
   * 푸시 실패가 본 요청을 깨뜨리면 안 되므로 여기서 삼키고 로그만 남긴다.
   */
  async dispatch(input: NotificationInput): Promise<void> {
    if (!(await this.repository.insert(input))) return

    try {
      const [nickname, devices] = await Promise.all([
        this.repository.findNickname(input.actorId),
        this.devicesRepository.listActiveTokens(input.userId),
      ])
      if (devices.length === 0) return

      const result = await this.push.send(
        devices.map((device) => ({
          pushToken: device.pushToken,
          title: nickname ?? 'CUTIN',
          body: bodies[input.type],
          data: { targetType: input.targetType, targetId: input.targetId },
        })),
      )
      await this.devicesRepository.revokeTokens(result.invalidTokens)
    } catch (error) {
      this.logger.error('즉시 푸시 발송 실패', error instanceof Error ? error.stack : error)
    }
  }

  /** 대상이 사라지면 알림도 의미가 없어 함께 지운다. */
  async removeByTarget(type: NotificationType, targetId: string, actorId: string): Promise<void> {
    await this.repository.removeByTarget(type, targetId, actorId)
  }

  async list(userId: string, page: CursorQuery): Promise<Page<NotificationView>> {
    const rows = await this.repository.list(userId, page)
    return toPage(
      rows,
      page.limit,
      (row) => this.toView(row),
      (row) => encodeCursor(row.createdAt.toISOString(), row.id),
    )
  }

  async unreadCount(userId: string) {
    return { count: await this.repository.countUnread(userId) }
  }

  /** 읽음 처리 후 남은 미읽음 개수를 준다. 뱃지를 다시 물어보지 않아도 되게 하기 위해서다. */
  async markRead(userId: string, ids?: string[]) {
    await this.repository.markRead(userId, ids)
    return { count: await this.repository.countUnread(userId) }
  }

  private toView(row: NotificationWithActor): NotificationView {
    return {
      id: row.id,
      type: row.type,
      actor: {
        id: row.actor.id,
        nickname: row.actor.nickname,
        avatarUrl: row.actor.avatar === null ? null : this.storage.url(row.actor.avatar.storageKey),
      },
      targetType: row.targetType,
      targetId: row.targetId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  }
}

export interface NotificationView {
  id: string
  type: NotificationWithActor['type']
  actor: { id: string; nickname: string | null; avatarUrl: string | null }
  targetType: NotificationWithActor['targetType']
  targetId: string
  readAt: string | null
  createdAt: string
}
