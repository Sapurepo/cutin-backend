import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { reactionTypes } from '../../db/schema/index.ts'

export const putReactionBodySchema = z.object({
  type: z.enum(reactionTypes),
})

export const reactionCountSchema = z.object({
  type: z.enum(reactionTypes),
  count: z.number().int().min(0),
})

export const reactionSummarySchema = z.object({
  total: z.number().int().min(0),
  counts: z.array(reactionCountSchema),
  /** 내가 누른 반응. 없으면 null */
  mine: z.enum(reactionTypes).nullable(),
})

export class PutReactionBodyDto extends createZodDto(putReactionBodySchema) {}
export class ReactionSummaryDto extends createZodDto(reactionSummarySchema) {}
