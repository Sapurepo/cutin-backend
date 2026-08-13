import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import {
  type Media,
  type NotificationTargetType,
  type NotificationType,
  notifications,
  type User,
} from '../../db/schema/index.ts'
import { decodeCursor } from '../../shared/pagination/cursor.ts'

export interface NotificationInput {
  userId: string
  actorId: string
  type: NotificationType
  targetType: NotificationTargetType
  targetId: string
}

export type NotificationWithActor = typeof notifications.$inferSelect & {
  actor: User & { avatar: Media | null }
}

export function createNotificationsRepository(db: Database) {
  return {
    /** 자기 행동에 대한 알림은 만들지 않는다. 호출부마다 검사하지 않도록 여기서 거른다. */
    async insert(input: NotificationInput): Promise<void> {
      if (input.userId === input.actorId) return
      await db.insert(notifications).values(input)
    },

    /** 대상이 사라지면 알림도 의미가 없어 함께 지운다. */
    async removeByTarget(type: NotificationType, targetId: string, actorId: string): Promise<void> {
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.type, type),
            eq(notifications.targetId, targetId),
            eq(notifications.actorId, actorId),
          ),
        )
    },

    async list(
      userId: string,
      { cursor, limit }: { cursor?: string; limit: number },
    ): Promise<NotificationWithActor[]> {
      const conditions = [eq(notifications.userId, userId)]
      if (cursor !== undefined) {
        const [createdAt, id] = decodeCursor(cursor)
        conditions.push(
          sql`(${notifications.createdAt}, ${notifications.id}) < (${createdAt}::timestamptz, ${id}::uuid)`,
        )
      }
      return db.query.notifications.findMany({
        where: and(...conditions),
        with: { actor: { with: { avatar: true } } },
        orderBy: [desc(notifications.createdAt), desc(notifications.id)],
        limit: limit + 1,
      })
    },

    async countUnread(userId: string): Promise<number> {
      const [row] = await db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      return row?.value ?? 0
    },

    /** ids를 주지 않으면 안 읽은 알림을 모두 읽음 처리한다. */
    async markRead(userId: string, ids?: string[]): Promise<number> {
      const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)]
      if (ids !== undefined) conditions.push(inArray(notifications.id, ids))

      const rows = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions))
        .returning({ id: notifications.id })
      return rows.length
    },
  }
}

export type NotificationsRepository = ReturnType<typeof createNotificationsRepository>
