import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { posts } from './posts.ts'
import { users } from './users.ts'

/**
 * 보관(북마크). 기기가 아니라 계정에 붙는 상태라 서버가 소유한다 — 기기를 바꿔도 따라가야 한다.
 *
 * 반응과 달리 토글이 아니라 상태 지정이다. 유니크 인덱스가 멱등성을 보장하므로
 * 같은 포스트를 두 번 보관해도 행이 하나다.
 */
export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bookmarks_post_user_idx').on(table.postId, table.userId),
    // 목록은 보관한 시각 최신순이다. 포스트 작성 시각이 아니다.
    index('bookmarks_user_created_at_idx').on(table.userId, table.createdAt),
  ],
)

export type Bookmark = typeof bookmarks.$inferSelect
