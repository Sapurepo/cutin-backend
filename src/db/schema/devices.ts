import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const devicePlatforms = ['ios'] as const
export type DevicePlatform = (typeof devicePlatforms)[number]

/**
 * 푸시 대상 디바이스. 슬롯 리마인더는 서버의 `users.timezone`이 아니라
 * **디바이스 타임존** 기준으로 보낸다 (명세 §3.3).
 * 같은 사용자가 기기를 여러 대 쓸 수 있어 토큰이 식별자다.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    platform: text({ enum: devicePlatforms }).notNull(),
    pushToken: text().notNull().unique(),
    timezone: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** 로그아웃·토큰 폐기 시 채운다. 발송 대상에서 빠진다. */
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('devices_user_idx').on(table.userId)],
)

export type Device = typeof devices.$inferSelect
