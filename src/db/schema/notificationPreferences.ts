import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const notificationSlots = ['morning', 'lunch', 'evening', 'night'] as const
export type NotificationSlot = (typeof notificationSlots)[number]

/**
 * 리마인더성 푸시가 예약되는 선호 시간대(다중 선택).
 * 댓글·반응·팔로우 알림은 슬롯과 무관하게 즉시 발송한다.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id),
  slots: text({ enum: notificationSlots }).array().notNull(),
  pushEnabled: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type NotificationPreference = typeof notificationPreferences.$inferSelect
