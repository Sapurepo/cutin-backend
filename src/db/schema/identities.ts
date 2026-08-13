import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const oauthProviders = ['google', 'kakao'] as const
export type OauthProvider = (typeof oauthProviders)[number]

/**
 * 소셜 로그인 계정. 한 사용자가 여러 프로바이더를 연결할 수 있다.
 * 동일 이메일이면 기존 사용자에 자동 연결하되, email이 null이면(카카오 이메일 미제공)
 * 연결하지 않고 새 계정을 만든다.
 */
export const identities = pgTable(
  'identities',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    provider: text({ enum: oauthProviders }).notNull(),
    providerUserId: text().notNull(),
    email: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('identities_provider_provider_user_id_idx').on(
      table.provider,
      table.providerUserId,
    ),
    index('identities_email_idx').on(table.email),
  ],
)

export type Identity = typeof identities.$inferSelect
