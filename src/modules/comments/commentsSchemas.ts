import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { pageSchema } from '../../shared/pagination/paginationSchemas.ts'
import { publicUserSchema } from '../social/socialSchemas.ts'

export const commentIdSchema = z.uuid()

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

export class CreateCommentBodyDto extends createZodDto(createCommentBodySchema) {}
export class CommentDto extends createZodDto(commentSchema) {}
export class CommentPageDto extends createZodDto(commentPageSchema) {}
