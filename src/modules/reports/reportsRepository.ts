import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import {
  comments,
  posts,
  type Report,
  type ReportReason,
  type ReportTargetType,
  reports,
  users,
} from '../../db/schema/index.ts'

@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 유니크 인덱스에 걸리면 undefined. 즉 "이미 신고한 대상"이라는 뜻이다. */
  async create(values: {
    reporterId: string
    targetType: ReportTargetType
    targetId: string
    reason: ReportReason
    detail: string | null
  }): Promise<Report | undefined> {
    const [row] = await this.db.insert(reports).values(values).onConflictDoNothing().returning()
    return row
  }

  /** 신고 대상이 실제로 존재하는지 확인한다. 삭제된 것은 신고할 수 없다. */
  async targetExists(targetType: ReportTargetType, targetId: string): Promise<boolean> {
    if (targetType === 'post') {
      const row = await this.db.query.posts.findFirst({
        where: and(eq(posts.id, targetId), isNull(posts.deletedAt)),
        columns: { id: true },
      })
      return row !== undefined
    }
    if (targetType === 'comment') {
      const row = await this.db.query.comments.findFirst({
        where: and(eq(comments.id, targetId), isNull(comments.deletedAt)),
        columns: { id: true },
      })
      return row !== undefined
    }
    const row = await this.db.query.users.findFirst({
      where: and(eq(users.id, targetId), isNull(users.deletedAt)),
      columns: { id: true },
    })
    return row !== undefined
  }
}
