import { Injectable } from '@nestjs/common'
import type { DevicePlatform } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { DevicesRepository } from './devicesRepository.ts'

@Injectable()
export class DevicesService {
  constructor(private readonly repository: DevicesRepository) {}

  /**
   * 앱이 켜질 때마다 부른다. 토큰은 기기당 하나이므로 갱신으로 처리한다.
   * 기기를 넘겨받은 경우(다른 계정 로그인)에도 소유자가 바뀌어야 하므로 upsert다.
   */
  async register(
    userId: string,
    input: { platform: DevicePlatform; pushToken: string; timezone: string },
  ) {
    const device = await this.repository.register({ userId, ...input })
    return { id: device.id, platform: device.platform, timezone: device.timezone }
  }

  async revoke(userId: string, pushToken: string): Promise<void> {
    if (!(await this.repository.revoke(userId, pushToken))) {
      throw AppError.notFound('DEVICE_NOT_FOUND', '디바이스를 찾을 수 없습니다.')
    }
  }
}
