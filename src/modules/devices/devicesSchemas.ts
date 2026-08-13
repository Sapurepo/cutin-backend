import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { devicePlatforms } from '../../db/schema/index.ts'

/** IANA 타임존. 슬롯 리마인더가 이 값으로 발송 시각을 계산한다. */
const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}, '올바른 IANA 타임존이 아닙니다')

export const registerDeviceBodySchema = z.object({
  platform: z.enum(devicePlatforms),
  pushToken: z.string().min(1).max(512),
  timezone: timezoneSchema,
})

export const deviceSchema = z.object({
  id: z.uuid(),
  platform: z.enum(devicePlatforms),
  timezone: z.string(),
})

export const revokeDeviceBodySchema = z.object({
  pushToken: z.string().min(1).max(512),
})

export class RegisterDeviceBodyDto extends createZodDto(registerDeviceBodySchema) {}
export class DeviceDto extends createZodDto(deviceSchema) {}
export class RevokeDeviceBodyDto extends createZodDto(revokeDeviceBodySchema) {}
