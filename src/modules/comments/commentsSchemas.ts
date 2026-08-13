import { z } from 'zod'
import { pageSchema } from '../../shared/pagination/paginationSchemas.ts'
import { publicUserSchema } from '../social/socialSchemas.ts'

export const commentIdParamsSchema = z.object({
  id: z.uuid(),
  commentId: z.uuid(),
})

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(500),
})

export const commentSchema = z.object({
  id: z.uuid(),
  author: publicUserSchema,
  body: z.string(),
  createdAt: z.string(),
})

export const commentPageSchema = pageSchema(commentSchema)
