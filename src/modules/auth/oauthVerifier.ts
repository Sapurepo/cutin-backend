import { Logger } from '@nestjs/common'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from '../../config/env.ts'
import type { OauthProvider } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'

/**
 * 클라이언트에는 실패 이유를 뭉뚱그려 내려보내지만(토큰 유효성 탐색을 돕지 않는다),
 * 서버 로그에는 남긴다. 이게 없으면 401만 찍혀 프로바이더 문제인지 우리 문제인지 알 수 없다.
 * 토큰은 절대 로그에 넣지 않는다.
 */
const logger = new Logger('OauthVerifier')

export interface OauthProfile {
  provider: OauthProvider
  providerUserId: string
  /** 카카오는 이메일 미제공 계정이 있으므로 null일 수 있다. */
  email: string | null
}

/** 테스트가 프로바이더 응답을 스텁하기 위한 주입점 */
export const OAUTH_VERIFIER = Symbol('OAUTH_VERIFIER')

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
    // 카카오는 실패 이유를 본문에 담아준다 (`{"msg":...,"code":-401}`).
    const detail = await response.text().catch(() => '')
    logger.warn(`카카오 검증 거절 — HTTP ${response.status} ${detail.slice(0, 300)}`)
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
      // 네트워크 실패·JWT 서명 불일치 등. 여기서 안 남기면 흔적이 사라진다.
      logger.warn(
        `${provider} 검증 중 오류 — ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      )
      throw AppError.unauthorized('OAUTH_VERIFICATION_FAILED', '소셜 토큰 검증에 실패했습니다.')
    }
  },
}
