import { z } from 'zod'
import { reportReasons, reportStatuses, reportTargetTypes } from '../../db/schema/index.ts'

export const createReportBodySchema = z.object({
  targetType: z.enum(reportTargetTypes),
  targetId: z.uuid(),
  reason: z.enum(reportReasons),
  detail: z.string().max(500).nullable().optional(),
})

export const reportSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(reportTargetTypes),
  targetId: z.uuid(),
  reason: z.enum(reportReasons),
  status: z.enum(reportStatuses),
  createdAt: z.string(),
})
