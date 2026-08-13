import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

/** 차단은 양방향 노출을 끊는다. 차단 시점에 팔로우·친구 관계도 함께 정리한다. */
export const blocks = pgTable(
  'blocks',
  {
    id: uuid().primaryKey().defaultRandom(),
    blockerId: uuid()
      .notNull()
      .references(() => users.id),
    blockedId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('blocks_blocker_blocked_idx').on(table.blockerId, table.blockedId),
    index('blocks_blocked_idx').on(table.blockedId),
  ],
)

export type Block = typeof blocks.$inferSelect
