import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const reportTargetTypes = ['post', 'comment', 'user'] as const
export type ReportTargetType = (typeof reportTargetTypes)[number]

export const reportReasons = ['spam', 'abuse', 'sexualContent', 'copyright', 'other'] as const
export type ReportReason = (typeof reportReasons)[number]

export const reportStatuses = ['pending', 'reviewing', 'resolved'] as const
export type ReportStatus = (typeof reportStatuses)[number]

/** 접수만 P4 범위다. 처리 큐와 대응 로그는 어드민(P6)에서 붙는다. */
export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id),
    targetType: text({ enum: reportTargetTypes }).notNull(),
    targetId: uuid().notNull(),
    reason: text({ enum: reportReasons }).notNull(),
    detail: text(),
    status: text({ enum: reportStatuses }).notNull().default('pending'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // 같은 대상을 반복 신고해 큐를 채우지 못하게 한다.
    uniqueIndex('reports_reporter_target_idx').on(
      table.reporterId,
      table.targetType,
      table.targetId,
    ),
    index('reports_status_created_at_idx').on(table.status, table.createdAt),
  ],
)

export type Report = typeof reports.$inferSelect
