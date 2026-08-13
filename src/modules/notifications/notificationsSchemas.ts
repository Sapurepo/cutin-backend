import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { notificationTargetTypes, notificationTypes } from '../../db/schema/index.ts'
import { pageSchema } from '../../shared/pagination/paginationSchemas.ts'
import { publicUserSchema } from '../social/socialSchemas.ts'

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(notificationTypes),
  actor: publicUserSchema,
  /** 클라이언트가 어느 화면으로 이동할지 정하는 데 쓴다. */
  targetType: z.enum(notificationTargetTypes),
  targetId: z.uuid(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})

export const notificationPageSchema = pageSchema(notificationSchema)

export const unreadCountSchema = z.object({ count: z.number().int().min(0) })

export const markReadBodySchema = z.object({
  /** 생략하면 안 읽은 알림을 전부 읽음 처리한다. */
  ids: z.array(z.uuid()).min(1).max(100).optional(),
})

export class NotificationPageDto extends createZodDto(notificationPageSchema) {}
export class UnreadCountDto extends createZodDto(unreadCountSchema) {}
export class MarkReadBodyDto extends createZodDto(markReadBodySchema) {}
