import { encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'
import type { CursorQuery } from '../../shared/pagination/paginationSchemas.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import type { NotificationsRepository, NotificationWithActor } from './notificationsRepository.ts'

export function createNotificationsService(
  repository: NotificationsRepository,
  storage: StorageService,
) {
  function toView(row: NotificationWithActor) {
    return {
      id: row.id,
      type: row.type,
      actor: {
        id: row.actor.id,
        nickname: row.actor.nickname,
        avatarUrl: row.actor.avatar === null ? null : storage.url(row.actor.avatar.storageKey),
      },
      targetType: row.targetType,
      targetId: row.targetId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  return {
    async list(userId: string, page: CursorQuery): Promise<Page<ReturnType<typeof toView>>> {
      const rows = await repository.list(userId, page)
      return toPage(rows, page.limit, toView, (row) =>
        encodeCursor(row.createdAt.toISOString(), row.id),
      )
    },

    async unreadCount(userId: string) {
      return { count: await repository.countUnread(userId) }
    },

    /** 읽음 처리 후 남은 미읽음 개수를 준다. 뱃지를 다시 물어보지 않아도 되게 하기 위해서다. */
    async markRead(userId: string, ids?: string[]) {
      await repository.markRead(userId, ids)
      return { count: await repository.countUnread(userId) }
    },
  }
}
