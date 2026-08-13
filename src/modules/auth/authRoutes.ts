import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createAuthRepository } from './authRepository.ts'
import {
  loginResponseSchema,
  oauthLoginBodySchema,
  oauthLoginParamsSchema,
  refreshBodySchema,
  tokensResponseSchema,
} from './authSchemas.ts'
import { createAuthService } from './authService.ts'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createAuthService(createAuthRepository(app.db), app.oauthVerifier)

  app.post(
    '/auth/oauth/:provider',
    {
      schema: {
        tags: ['auth'],
        summary: '소셜 로그인',
        description: 'iOS SDK가 받은 토큰을 서버가 프로바이더에 검증한 뒤 세션 토큰을 발급한다.',
        params: oauthLoginParamsSchema,
        body: oauthLoginBodySchema,
        response: {
          200: loginResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => service.loginWithOauth(request.params.provider, request.body.token),
  )

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: '액세스 토큰 재발급',
        body: refreshBodySchema,
        response: { 200: tokensResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.refresh(request.body.refreshToken),
  )

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: '로그아웃',
        body: refreshBodySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.logout(request.body.refreshToken)
      return reply.status(204).send(null)
    },
  )
}
