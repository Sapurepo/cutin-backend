import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import {
  type Device,
  type DevicePlatform,
  devices,
  type NotificationSlot,
  notificationPreferences,
  users,
} from '../../db/schema/index.ts'

/** 리마인더 잡이 대상을 고르는 데 필요한 최소 정보 */
export interface ReminderTarget {
  userId: string
  pushToken: string
  timezone: string
  /** 사용자가 고른 슬롯. 설정 행이 없으면 null이고 호출부가 기본값을 적용한다. */
  slots: NotificationSlot[] | null
}

@Injectable()
export class DevicesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 같은 토큰이 다시 오면 소유자·타임존을 갱신하고 폐기 상태를 되돌린다. */
  async register(values: {
    userId: string
    platform: DevicePlatform
    pushToken: string
    timezone: string
  }): Promise<Device> {
    const [row] = await this.db
      .insert(devices)
      .values(values)
      .onConflictDoUpdate({
        target: devices.pushToken,
        set: {
          userId: values.userId,
          platform: values.platform,
          timezone: values.timezone,
          revokedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning()
    if (row === undefined) throw new Error('디바이스 등록에 실패했습니다.')
    return row
  }

  async revoke(userId: string, pushToken: string): Promise<boolean> {
    const rows = await this.db
      .update(devices)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(devices.userId, userId), eq(devices.pushToken, pushToken)))
      .returning({ id: devices.id })
    return rows.length > 0
  }

  /** 유효하지 않다고 판정된 토큰을 한 번에 폐기한다. */
  async revokeTokens(pushTokens: string[]): Promise<void> {
    if (pushTokens.length === 0) return
    await this.db
      .update(devices)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(inArray(devices.pushToken, pushTokens))
  }

  /**
   * 리마인더를 받을 수 있는 디바이스 전체.
   * 푸시를 끈 사용자와 탈퇴·정지 계정은 여기서 걸러 잡이 신경 쓰지 않게 한다.
   */
  listReminderTargets(): Promise<ReminderTarget[]> {
    return this.db
      .select({
        userId: devices.userId,
        pushToken: devices.pushToken,
        timezone: devices.timezone,
        slots: notificationPreferences.slots,
      })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, devices.userId))
      .where(
        and(
          isNull(devices.revokedAt),
          isNull(users.deletedAt),
          eq(users.status, 'active'),
          sql`coalesce(${notificationPreferences.pushEnabled}, true)`,
        ),
      )
  }

  /** 즉시 알림을 보낼 대상. 폐기되지 않고 푸시가 켜진 디바이스만. */
  listActiveTokens(userId: string): Promise<{ pushToken: string }[]> {
    return this.db
      .select({ pushToken: devices.pushToken })
      .from(devices)
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, devices.userId))
      .where(
        and(
          eq(devices.userId, userId),
          isNull(devices.revokedAt),
          sql`coalesce(${notificationPreferences.pushEnabled}, true)`,
        ),
      )
  }
}
