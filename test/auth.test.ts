import { sql } from 'drizzle-orm'
import { decodeJwt } from 'jose'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import type { OauthProfile } from '../src/modules/auth/oauthVerifier.ts'
import { truncateAll } from './helpers/fixtures.ts'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

beforeEach(async () => {
  await context.database.db.execute(sql.raw(truncateAll))
})

async function login(profile: OauthProfile) {
  context.oauth.setProfile(profile)
  const response = await context.app.inject({
    method: 'POST',
    url: `/auth/oauth/${profile.provider}`,
    payload: { token: 'stub-token' },
  })
  expect(response.statusCode).toBe(200)
  return response.json() as {
    accessToken: string
    refreshToken: string
    expiresIn: number
    onboardingCompleted: boolean
  }
}

function userIdOf(accessToken: string): string {
  const sub = decodeJwt(accessToken).sub
  if (sub === undefined) throw new Error('토큰에 sub가 없습니다.')
  return sub
}

const googleProfile: OauthProfile = {
  provider: 'google',
  providerUserId: 'google-1',
  email: 'user@example.com',
}

test('신규 가입은 온보딩 미완료 상태로 토큰을 발급한다', async () => {
  const result = await login(googleProfile)

  expect(result.onboardingCompleted).toBe(false)
  expect(result.expiresIn).toBe(900)
  expect(result.refreshToken).not.toBe('')
})

test('가입 → 온보딩 완료 → 재로그인 전 플로우가 이어진다', async () => {
  const { accessToken } = await login(googleProfile)
  const auth = { authorization: `Bearer ${accessToken}` }

  const availability = await context.app.inject({
    method: 'GET',
    url: '/users/nickname/availability?nickname=cutter',
    headers: auth,
  })
  expect(availability.json()).toEqual({ available: true, reason: null })

  const patched = await context.app.inject({
    method: 'PATCH',
    url: '/users/me',
    headers: auth,
    payload: { nickname: 'cutter', timezone: 'Asia/Seoul' },
  })
  expect(patched.statusCode).toBe(200)
  expect(patched.json()).toMatchObject({ nickname: 'cutter', onboardingCompleted: false })

  const preferences = await context.app.inject({
    method: 'PUT',
    url: '/users/me/notification-preferences',
    headers: auth,
    payload: { slots: ['morning', 'night', 'morning'] },
  })
  expect(preferences.json()).toEqual({ slots: ['morning', 'night'], pushEnabled: true })

  const completed = await context.app.inject({
    method: 'POST',
    url: '/users/me/onboarding/complete',
    headers: auth,
  })
  expect(completed.statusCode).toBe(200)
  expect(completed.json()).toMatchObject({ onboardingCompleted: true })

  const relogin = await login(googleProfile)
  expect(relogin.onboardingCompleted).toBe(true)
  expect(userIdOf(relogin.accessToken)).toBe(userIdOf(accessToken))
})

test('닉네임 없이 온보딩을 완료할 수 없다', async () => {
  const { accessToken } = await login(googleProfile)

  const response = await context.app.inject({
    method: 'POST',
    url: '/users/me/onboarding/complete',
    headers: { authorization: `Bearer ${accessToken}` },
  })

  expect(response.statusCode).toBe(400)
  expect(response.json().error.code).toBe('NICKNAME_REQUIRED')
})

test('이미 쓰이는 닉네임은 409, 금칙어는 400으로 막는다', async () => {
  const first = await login(googleProfile)
  await context.app.inject({
    method: 'PATCH',
    url: '/users/me',
    headers: { authorization: `Bearer ${first.accessToken}` },
    payload: { nickname: 'cutter' },
  })

  const second = await login({ provider: 'kakao', providerUserId: 'kakao-1', email: null })
  const auth = { authorization: `Bearer ${second.accessToken}` }

  const taken = await context.app.inject({
    method: 'PATCH',
    url: '/users/me',
    headers: auth,
    payload: { nickname: 'Cutter' },
  })
  expect(taken.statusCode).toBe(409)
  expect(taken.json().error.code).toBe('NICKNAME_TAKEN')

  const forbidden = await context.app.inject({
    method: 'PATCH',
    url: '/users/me',
    headers: auth,
    payload: { nickname: '운영자' },
  })
  expect(forbidden.statusCode).toBe(400)
  expect(forbidden.json().error.code).toBe('NICKNAME_FORBIDDEN')
})

test('동일 이메일의 다른 프로바이더는 같은 계정에 연결된다', async () => {
  const google = await login(googleProfile)
  const kakao = await login({
    provider: 'kakao',
    providerUserId: 'kakao-1',
    email: 'user@example.com',
  })

  expect(userIdOf(kakao.accessToken)).toBe(userIdOf(google.accessToken))
})

test('이메일이 없는 카카오 계정은 연결하지 않고 새 계정을 만든다', async () => {
  const google = await login(googleProfile)
  const kakao = await login({ provider: 'kakao', providerUserId: 'kakao-1', email: null })

  expect(userIdOf(kakao.accessToken)).not.toBe(userIdOf(google.accessToken))
})

test('리프레시는 회전하고, 재사용되면 계열 전체가 폐기된다', async () => {
  const { refreshToken } = await login(googleProfile)

  const rotated = await context.app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken },
  })
  expect(rotated.statusCode).toBe(200)
  const next = rotated.json() as { refreshToken: string }
  expect(next.refreshToken).not.toBe(refreshToken)

  const reused = await context.app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken },
  })
  expect(reused.statusCode).toBe(401)
  expect(reused.json().error.code).toBe('REFRESH_TOKEN_REUSED')

  // 재사용이 감지되면 회전된 최신 토큰도 함께 폐기된다.
  const afterBreach = await context.app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: next.refreshToken },
  })
  expect(afterBreach.statusCode).toBe(401)
})

test('로그아웃하면 해당 계열의 리프레시 토큰이 무효가 된다', async () => {
  const { refreshToken } = await login(googleProfile)

  const loggedOut = await context.app.inject({
    method: 'POST',
    url: '/auth/logout',
    payload: { refreshToken },
  })
  expect(loggedOut.statusCode).toBe(204)

  const refreshed = await context.app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken },
  })
  expect(refreshed.statusCode).toBe(401)
})

test('토큰 없이 보호된 라우트에 접근하면 401', async () => {
  const response = await context.app.inject({ method: 'PATCH', url: '/users/me', payload: {} })

  expect(response.statusCode).toBe(401)
  expect(response.json().error.code).toBe('UNAUTHORIZED')
})
