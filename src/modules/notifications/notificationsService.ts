import { Inject, Injectable } from '@nestjs/common'
import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import type { NotificationWithActor } from './notificationsRepository.ts'
import { NotificationsRepository } from './notificationsRepository.ts'

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

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
