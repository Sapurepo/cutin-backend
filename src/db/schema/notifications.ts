import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const notificationTypes = ['comment', 'reaction', 'follow'] as const
export type NotificationType = (typeof notificationTypes)[number]

/** 클라이언트가 어느 화면으로 보낼지 정하는 데 쓴다. */
export const notificationTargetTypes = ['post', 'user'] as const
export type NotificationTargetType = (typeof notificationTargetTypes)[number]

/**
 * 인앱 알림 레코드. 푸시 발송과는 별개로 항상 남긴다.
 * 리마인더성 알림은 슬롯 예약을 타므로 여기 들어오지 않는다 (P5).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** 알림을 받는 사람 */
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** 알림을 일으킨 사람 */
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    type: text({ enum: notificationTypes }).notNull(),
    targetType: text({ enum: notificationTargetTypes }).notNull(),
    targetId: uuid().notNull(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_user_created_at_idx').on(table.userId, table.createdAt)],
)

export type Notification = typeof notifications.$inferSelect
