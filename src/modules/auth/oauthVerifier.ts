import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from '../../config/env.ts'
import type { OauthProvider } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'

export interface OauthProfile {
  provider: OauthProvider
  providerUserId: string
  /** 카카오는 이메일 미제공 계정이 있으므로 null일 수 있다. */
  email: string | null
}

/** iOS SDK가 받아온 토큰을 서버가 프로바이더에 되물어 검증한다. */
export interface OauthVerifier {
  verify(provider: OauthProvider, token: string): Promise<OauthProfile>
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

async function verifyGoogle(idToken: string): Promise<OauthProfile> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  })
  if (typeof payload.sub !== 'string') {
    throw AppError.unauthorized(
      'OAUTH_VERIFICATION_FAILED',
      '구글 토큰에 사용자 식별자가 없습니다.',
    )
  }
  const emailVerified = payload.email_verified === true
  return {
    provider: 'google',
    providerUserId: payload.sub,
    email: emailVerified && typeof payload.email === 'string' ? payload.email : null,
  }
}

async function verifyKakao(accessToken: string): Promise<OauthProfile> {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw AppError.unauthorized('OAUTH_VERIFICATION_FAILED', '카카오 토큰 검증에 실패했습니다.')
  }
  const body = (await response.json()) as {
    id?: number
    kakao_account?: { email?: string; is_email_verified?: boolean }
  }
  if (body.id === undefined) {
    throw AppError.unauthorized(
      'OAUTH_VERIFICATION_FAILED',
      '카카오 응답에 사용자 식별자가 없습니다.',
    )
  }
  const account = body.kakao_account
  const email = account?.is_email_verified === true ? (account.email ?? null) : null
  return { provider: 'kakao', providerUserId: String(body.id), email }
}

export const httpOauthVerifier: OauthVerifier = {
  async verify(provider, token) {
    try {
      return provider === 'google' ? await verifyGoogle(token) : await verifyKakao(token)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw AppError.unauthorized('OAUTH_VERIFICATION_FAILED', '소셜 토큰 검증에 실패했습니다.')
    }
  },
}
