import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

/** 팔로우는 단방향이다. 상호 팔로우가 성립하면 `friendships`에 파생 행이 생긴다. */
export const follows = pgTable(
  'follows',
  {
    id: uuid().primaryKey().defaultRandom(),
    followerId: uuid()
      .notNull()
      .references(() => users.id),
    followeeId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('follows_follower_followee_idx').on(table.followerId, table.followeeId),
    index('follows_followee_created_at_idx').on(table.followeeId, table.createdAt),
  ],
)

export type Follow = typeof follows.$inferSelect
