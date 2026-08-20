import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { mediaKinds } from '../../db/schema/index.ts'

/** 업로드를 허용하는 이미지 포맷. iOS가 HEIC로 찍을 수 있어 함께 받는다. */
export const allowedMimes = ['image/jpeg', 'image/png', 'image/heic'] as const

export const createUploadBodySchema = z.object({
  kind: z.enum(mediaKinds),
  mime: z.enum(allowedMimes),
})

export const uploadTargetSchema = z.object({
  mediaId: z.uuid(),
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
})

export const completeUploadBodySchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const mediaSchema = z.object({
  id: z.uuid(),
  kind: z.enum(mediaKinds),
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
})

export class CreateUploadBodyDto extends createZodDto(createUploadBodySchema) {}
export class UploadTargetDto extends createZodDto(uploadTargetSchema) {}
export class CompleteUploadBodyDto extends createZodDto(completeUploadBodySchema) {}
export class MediaDto extends createZodDto(mediaSchema) {}
