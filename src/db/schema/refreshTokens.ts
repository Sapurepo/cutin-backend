import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

/**
 * 리프레시 토큰은 해시로만 저장한다. 같은 familyId가 한 로그인 세션의 rotation 계열이며,
 * 이미 회전된 토큰이 다시 제시되면(재사용 감지) 계열 전체를 폐기한다.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    familyId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('refresh_tokens_family_id_idx').on(table.familyId)],
)

export type RefreshToken = typeof refreshTokens.$inferSelect
