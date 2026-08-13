import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { posts } from './posts.ts'
import { users } from './users.ts'

/** 클라이언트가 이모지로 그린다. 종류를 열거형으로 두면 OpenAPI에도 그대로 나가 Swift가 분기할 수 있다. */
export const reactionTypes = ['like', 'love', 'haha', 'wow', 'sad'] as const
export type ReactionType = (typeof reactionTypes)[number]

/** 사용자당 포스트 1개 반응. 유니크 인덱스가 토글·교체를 강제한다. */
export const reactions = pgTable(
  'reactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    type: text({ enum: reactionTypes }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('reactions_post_user_idx').on(table.postId, table.userId)],
)

export type Reaction = typeof reactions.$inferSelect
