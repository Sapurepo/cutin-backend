import { createHash, randomBytes } from 'node:crypto'
import { errors, jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env.ts'
import { AppError } from '../errors/appError.ts'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

const ISSUER = 'cutin'
const secret = new TextEncoder().encode(env.JWT_SECRET)

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER })
    if (payload.sub === undefined) {
      throw AppError.unauthorized('INVALID_TOKEN', '토큰이 올바르지 않습니다.')
    }
    return payload.sub
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw AppError.unauthorized('TOKEN_EXPIRED', '토큰이 만료되었습니다.')
    }
    if (error instanceof AppError) throw error
    throw AppError.unauthorized('INVALID_TOKEN', '토큰이 올바르지 않습니다.')
  }
}

/** 리프레시 토큰은 원문을 클라이언트에만 주고 DB에는 해시만 남긴다. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashRefreshToken(token) }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
