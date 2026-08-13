import { z } from 'zod'
import { postStatuses, postVisibilities } from '../../db/schema/index.ts'
import { cursorQuerySchema, pageSchema } from '../../shared/pagination/paginationSchemas.ts'
import { mediaSchema } from '../media/mediaSchemas.ts'
import { reactionSummarySchema } from '../reactions/reactionsSchemas.ts'

export const postIdParamsSchema = z.object({ id: z.uuid() })

/** 실제 상한은 템플릿의 cutCount다. 여기 값은 비정상적으로 큰 요청을 막는 안전장치일 뿐이다. */
const maxCutsPerRequest = 20

export const templateSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

export const templateSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  cutCount: z.number().int().positive(),
  aspectRatio: z.string(),
  slots: z.array(templateSlotSchema),
})

export const templatesResponseSchema = z.object({ items: z.array(templateSchema) })

export const cutInputSchema = z.object({
  cutIndex: z.number().int().min(0),
  mediaId: z.uuid(),
})

export const createPostBodySchema = z.object({ templateId: z.uuid() })

export const updatePostBodySchema = z
  .object({
    templateId: z.uuid().optional(),
    caption: z.string().max(500).nullable().optional(),
    visibility: z.enum(postVisibilities).optional(),
    thumbnailCutIndex: z.number().int().min(0).nullable().optional(),
    /** 부분 수정이 아니라 전체 교체다. */
    cuts: z.array(cutInputSchema).max(maxCutsPerRequest).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, '변경할 항목이 없습니다')

export const publishPostBodySchema = z.object({
  composedMediaId: z.uuid(),
  caption: z.string().max(500).nullable().optional(),
  visibility: z.enum(postVisibilities).optional(),
  thumbnailCutIndex: z.number().int().min(0).optional(),
})

export const postAuthorSchema = z.object({
  id: z.uuid(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})

export const postCutSchema = z.object({
  cutIndex: z.number().int().min(0),
  media: mediaSchema,
})

export const postSchema = z.object({
  id: z.uuid(),
  author: postAuthorSchema,
  template: templateSchema,
  status: z.enum(postStatuses),
  visibility: z.enum(postVisibilities),
  caption: z.string().nullable(),
  thumbnailCutIndex: z.number().int().nullable(),
  cuts: z.array(postCutSchema),
  /** iOS가 만든 합성본. draft에는 없다. */
  composed: mediaSchema.nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  commentCount: z.number().int().min(0),
  reactions: reactionSummarySchema,
})

export const postPageSchema = pageSchema(postSchema)

export const shareLinkSchema = z.object({
  url: z.string(),
})

export const feedQuerySchema = cursorQuerySchema
