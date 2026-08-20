import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

/**
 * 맞팔이 성립한 쌍만 담는 파생 테이블. 피드가 매번 양방향 EXISTS를 돌지 않게 하는 것이 목적이다.
 * 한 쌍이 한 행만 갖도록 두 uuid를 사전순으로 정렬해 low/high에 넣는다.
 */
export const friendships = pgTable(
  'friendships',
  {
    userIdLow: uuid()
      .notNull()
      .references(() => users.id),
    userIdHigh: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userIdLow, table.userIdHigh] }),
    index('friendships_user_id_high_idx').on(table.userIdHigh),
  ],
)

export type Friendship = typeof friendships.$inferSelect
