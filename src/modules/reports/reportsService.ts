import type { ReportReason, ReportTargetType } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import type { ReportsRepository } from './reportsRepository.ts'

export function createReportsService(repository: ReportsRepository) {
  return {
    /** 접수까지가 P4 범위다. 처리 상태 변경은 어드민이 한다. */
    async create(
      reporterId: string,
      input: {
        targetType: ReportTargetType
        targetId: string
        reason: ReportReason
        detail?: string | null
      },
    ) {
      if (input.targetType === 'user' && input.targetId === reporterId) {
        throw AppError.badRequest('SELF_NOT_ALLOWED', '자기 자신은 신고할 수 없습니다.')
      }
      if (!(await repository.targetExists(input.targetType, input.targetId))) {
        throw AppError.notFound('REPORT_TARGET_NOT_FOUND', '신고 대상을 찾을 수 없습니다.')
      }

      const report = await repository.create({
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        detail: input.detail ?? null,
      })
      if (report === undefined) {
        throw AppError.conflict('ALREADY_REPORTED', '이미 신고한 대상입니다.')
      }

      return {
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      }
    },
  }
}
