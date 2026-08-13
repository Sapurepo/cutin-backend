import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const mediaKinds = ['cut', 'composed', 'avatar'] as const
export type MediaKind = (typeof mediaKinds)[number]

export const mediaStatuses = ['pending', 'ready'] as const
export type MediaStatus = (typeof mediaStatuses)[number]

/**
 * 업로드는 2단계다. 업로드 목적지를 받을 때 pending으로 만들고, complete 호출에서 ready가 된다.
 * pending 상태의 미디어는 포스트에 붙일 수 없다.
 */
export const media = pgTable('media', {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: uuid()
    .notNull()
    .references(() => users.id),
  kind: text({ enum: mediaKinds }).notNull(),
  status: text({ enum: mediaStatuses }).notNull().default('pending'),
  storageKey: text().notNull().unique(),
  mime: text().notNull(),
  bytes: integer(),
  width: integer(),
  height: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp({ withTimezone: true }),
})

export type Media = typeof media.$inferSelect
