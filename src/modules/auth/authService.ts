import { randomUUID } from 'node:crypto'
import type { OauthProvider, User } from '../../db/schema/index.ts'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
} from '../../shared/auth/tokens.ts'
import { AppError } from '../../shared/errors/appError.ts'
import type { AuthRepository } from './authRepository.ts'
import type { OauthVerifier } from './oauthVerifier.ts'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginResult extends AuthTokens {
  onboardingCompleted: boolean
}

export function createAuthService(repository: AuthRepository, oauthVerifier: OauthVerifier) {
  async function issueTokens(userId: string, familyId: string): Promise<AuthTokens> {
    const { token, hash } = generateRefreshToken()
    await repository.insertRefreshToken({
      userId,
      familyId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    return {
      accessToken: await signAccessToken(userId),
      refreshToken: token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    }
  }

  async function resolveUser(provider: OauthProvider, token: string): Promise<User> {
    const profile = await oauthVerifier.verify(provider, token)

    const identity = await repository.findIdentity(profile.provider, profile.providerUserId)
    if (identity !== undefined) {
      const user = await repository.findUserById(identity.userId)
      if (user === undefined) {
        // 탈퇴한 계정의 identity는 남아 있을 수 있다. 재가입으로 처리한다.
        return repository.createUserWithIdentity(profile)
      }
      return user
    }

    // 이메일이 확인된 경우에만 기존 계정에 연결한다. 카카오 이메일 미제공 계정은 새 계정이 된다.
    if (profile.email !== null) {
      const existingUserId = await repository.findUserIdByEmail(profile.email)
      if (existingUserId !== undefined) {
        await repository.linkIdentity(existingUserId, profile)
        const user = await repository.findUserById(existingUserId)
        if (user !== undefined) return user
      }
    }

    return repository.createUserWithIdentity(profile)
  }

  return {
    async loginWithOauth(provider: OauthProvider, token: string): Promise<LoginResult> {
      const user = await resolveUser(provider, token)
      if (user.status === 'suspended') {
        throw AppError.forbidden('ACCOUNT_SUSPENDED', '정지된 계정입니다.')
      }
      const tokens = await issueTokens(user.id, randomUUID())
      return { ...tokens, onboardingCompleted: user.onboardingCompletedAt !== null }
    },

    /**
     * rotation: 제시된 토큰을 폐기하고 같은 계열에서 새 토큰을 발급한다.
     * 이미 폐기된 토큰이 다시 오면 탈취로 보고 계열 전체를 폐기한다.
     */
    async refresh(refreshToken: string): Promise<AuthTokens> {
      const stored = await repository.findRefreshToken(hashRefreshToken(refreshToken))
      if (stored === undefined) {
        throw AppError.unauthorized('INVALID_REFRESH_TOKEN', '리프레시 토큰이 올바르지 않습니다.')
      }
      if (stored.revokedAt !== null) {
        await repository.revokeFamily(stored.familyId)
        throw AppError.unauthorized(
          'REFRESH_TOKEN_REUSED',
          '토큰이 재사용되어 세션을 종료했습니다.',
        )
      }
      if (stored.expiresAt.getTime() <= Date.now()) {
        throw AppError.unauthorized('REFRESH_TOKEN_EXPIRED', '리프레시 토큰이 만료되었습니다.')
      }

      await repository.revokeToken(stored.id)
      return issueTokens(stored.userId, stored.familyId)
    },

    /** 해당 디바이스의 계열만 끊는다. 다른 기기의 세션은 유지된다. */
    async logout(refreshToken: string): Promise<void> {
      const stored = await repository.findRefreshToken(hashRefreshToken(refreshToken))
      if (stored !== undefined) {
        await repository.revokeFamily(stored.familyId)
      }
    },
  }
}
