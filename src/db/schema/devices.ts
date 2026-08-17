import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.ts'

export const devicePlatforms = ['ios'] as const
export type DevicePlatform = (typeof devicePlatforms)[number]

export const pushEnvironments = ['sandbox', 'production'] as const
export type PushEnvironment = (typeof pushEnvironments)[number]

/**
 * 푸시 대상 디바이스. 슬롯 리마인더는 서버의 `users.timezone`이 아니라
 * **디바이스 타임존** 기준으로 보낸다 (명세 §3.3).
 * 같은 사용자가 기기를 여러 대 쓸 수 있어 토큰이 식별자다.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    platform: text({ enum: devicePlatforms }).notNull(),
    pushToken: text().notNull().unique(),
    /**
     * APNs 토큰은 한 환경에서만 유효하다 — sandbox 토큰을 production 엔드포인트로 보내면
     * `BadDeviceToken`이 온다. 인증 키(`.p8`)는 두 환경 공용이고 호스트만 다르므로
     * (`api.sandbox.push.apple.com` / `api.push.apple.com`) 필요한 건 이 값 하나뿐이다.
     *
     * 서버 전역 설정으로 두지 않는 이유: TestFlight 빌드는 production 토큰을 받는데
     * 그 빌드를 스테이징 서버에 붙이면 한 서버에 두 환경이 섞인다. 클라이언트가
     * `aps-environment`를 보고 알려주는 값이라 추측이 아니다.
     */
    pushEnvironment: text({ enum: pushEnvironments }).notNull().default('production'),
    timezone: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** 로그아웃·토큰 폐기 시 채운다. 발송 대상에서 빠진다. */
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('devices_user_idx').on(table.userId)],
)

export type Device = typeof devices.$inferSelect
