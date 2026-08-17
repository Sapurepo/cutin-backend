import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { devicePlatforms, pushEnvironments } from '../../db/schema/index.ts'

/** IANA 타임존. 슬롯 리마인더가 이 값으로 발송 시각을 계산한다. */
const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}, '올바른 IANA 타임존이 아닙니다')

/**
 * 토큰이 어느 APNs 엔드포인트로 가야 하는지. 클라이언트가
 * `embedded.mobileprovision`의 `aps-environment`를 보고 정한다 —
 * `development`면 `sandbox`, 그 외(App Store·TestFlight 포함)는 `production`.
 *
 * 선택 항목으로 두지 않는 이유: 안 보내면 조용히 production으로 잘못 등록되고
 * 푸시가 전부 실패하는데 원인이 드러나지 않는다. 조용한 실패보다 400이 낫다.
 */
const pushEnvironmentSchema = z.enum(pushEnvironments)

export const registerDeviceBodySchema = z.object({
  platform: z.enum(devicePlatforms),
  pushToken: z.string().min(1).max(512),
  pushEnvironment: pushEnvironmentSchema,
  timezone: timezoneSchema,
})

export const deviceSchema = z.object({
  id: z.uuid(),
  platform: z.enum(devicePlatforms),
  /** 서버가 어느 환경으로 기록했는지 클라이언트가 바로 확인할 수 있게 함께 내려준다 */
  pushEnvironment: pushEnvironmentSchema,
  timezone: z.string(),
})

export const revokeDeviceBodySchema = z.object({
  pushToken: z.string().min(1).max(512),
})

export class RegisterDeviceBodyDto extends createZodDto(registerDeviceBodySchema) {}
export class DeviceDto extends createZodDto(deviceSchema) {}
export class RevokeDeviceBodyDto extends createZodDto(revokeDeviceBodySchema) {}
