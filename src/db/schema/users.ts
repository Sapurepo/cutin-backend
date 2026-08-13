import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const userStatuses = ['active', 'suspended', 'withdrawn'] as const
export type UserStatus = (typeof userStatuses)[number]

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** 온보딩에서 설정하므로 가입 직후에는 null */
  nickname: text().unique(),
  /** media 테이블을 참조하지만 FK는 걸지 않는다. 순환 참조를 피하고, 미디어가 지워져도 계정은 살아 있어야 한다. */
  avatarMediaId: uuid(),
  timezone: text().notNull().default('Asia/Seoul'),
  status: text({ enum: userStatuses }).notNull().default('active'),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp({ withTimezone: true }),
})

export type User = typeof users.$inferSelect
