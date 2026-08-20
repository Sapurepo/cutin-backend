import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { posts } from './posts.ts'
import { users } from './users.ts'

/** 대댓글은 Phase 1 범위 밖이라 부모 참조를 두지 않는다. */
export const comments = pgTable(
  'comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('comments_post_created_at_idx').on(table.postId, table.createdAt)],
)

export type Comment = typeof comments.$inferSelect
