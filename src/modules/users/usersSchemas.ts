import { z } from 'zod'
import { notificationSlots } from '../../db/schema/index.ts'

/** 한글·영문·숫자·밑줄 2~16자. 공백과 특수문자는 금지. */
export const nicknameSchema = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[가-힣a-zA-Z0-9_]+$/, '한글·영문·숫자·밑줄만 사용할 수 있습니다')

export const nicknameAvailabilityQuerySchema = z.object({
  nickname: z.string(),
})

export const nicknameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['invalidFormat', 'forbiddenWord', 'taken']).nullable(),
})

export const updateMeBodySchema = z
  .object({
    nickname: nicknameSchema.optional(),
    timezone: z.string().min(1).optional(),
    /** kind가 avatar이고 업로드가 끝난 미디어 id. null을 보내면 기본 이미지로 돌아간다. */
    avatarMediaId: z.uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, '변경할 항목이 없습니다')

export const userProfileSchema = z.object({
  id: z.uuid(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  timezone: z.string(),
  onboardingCompleted: z.boolean(),
})

export const notificationPreferencesBodySchema = z.object({
  slots: z.array(z.enum(notificationSlots)).min(1).max(notificationSlots.length),
  pushEnabled: z.boolean().default(true),
})

export const notificationPreferencesResponseSchema = z.object({
  slots: z.array(z.enum(notificationSlots)),
  pushEnabled: z.boolean(),
})
