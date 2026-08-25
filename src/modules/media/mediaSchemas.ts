import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { mediaKinds } from '../../db/schema/index.ts'

/** 업로드를 허용하는 이미지 포맷. iOS가 HEIC로 찍을 수 있어 함께 받는다. */
export const allowedImageMimes = ['image/jpeg', 'image/png', 'image/heic'] as const

/** 촬영 영상(`motion`)만 쓴다. iOS `AVAssetWriter`가 내는 것이 mp4다. */
export const allowedVideoMimes = ['video/mp4'] as const

export const allowedMimes = [...allowedImageMimes, ...allowedVideoMimes] as const

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
