import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
// 값 임포트여야 한다 — 생성자 주입 타입이 런타임 메타데이터에 남아야 하기 때문이다.
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { AppError } from '../errors/appError.ts'
import { verifyAccessToken } from './tokens.ts'

const IS_PUBLIC = 'auth:isPublic'

/**
 * 인증을 건너뛴다. 이 데코레이터가 없는 모든 라우트는 인증을 요구한다 —
 * 라우트를 추가하다 인증을 빠뜨려도 조용히 공개되지 않게 하려는 것이다.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true)

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic === true) return true

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const header = request.headers.authorization
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('UNAUTHORIZED', '인증이 필요합니다.')
    }
    request.userId = await verifyAccessToken(header.slice('Bearer '.length))
    return true
  }
}

/** `AuthGuard`가 채운 userId를 컨트롤러 인자로 꺼낸다. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<FastifyRequest>()
  if (request.userId === undefined) {
    throw AppError.unauthorized('UNAUTHORIZED', '인증이 필요합니다.')
  }
  return request.userId
})
