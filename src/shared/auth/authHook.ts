import type { FastifyRequest, onRequestAsyncHookHandler } from 'fastify'
import { AppError } from '../errors/appError.ts'
import { verifyAccessToken } from './tokens.ts'

/**
 * `Authorization: Bearer <accessToken>`을 검증해 `request.userId`를 채운다.
 * 라우트에 `{ onRequest: requireAuth }`로 붙인다.
 */
export const requireAuth: onRequestAsyncHookHandler = async (request) => {
  const header = request.headers.authorization
  if (header === undefined || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('UNAUTHORIZED', '인증이 필요합니다.')
  }
  request.userId = await verifyAccessToken(header.slice('Bearer '.length))
}

/** `requireAuth`가 붙은 라우트에서 userId를 옵셔널 없이 꺼낸다. */
export function getUserId(request: FastifyRequest): string {
  if (request.userId === undefined) {
    throw AppError.unauthorized('UNAUTHORIZED', '인증이 필요합니다.')
  }
  return request.userId
}
