import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createNotificationsRepository } from '../notifications/notificationsRepository.ts'
import { createPostsRepository } from '../posts/postsRepository.ts'
import { postIdParamsSchema } from '../posts/postsSchemas.ts'
import { createReactionsRepository } from './reactionsRepository.ts'
import { putReactionBodySchema, reactionSummarySchema } from './reactionsSchemas.ts'
import { createReactionsService } from './reactionsService.ts'

export const reactionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createReactionsService(
    createReactionsRepository(app.db),
    createPostsRepository(app.db),
    createNotificationsRepository(app.db),
  )

  app.put(
    '/posts/:id/reaction',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['reactions'],
        summary: '반응 남기기 · 토글',
        description:
          '사용자당 포스트 1개 반응이다. 같은 종류를 다시 보내면 취소되고, 다른 종류면 교체된다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        body: putReactionBodySchema,
        response: {
          200: reactionSummarySchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.put(getUserId(request), request.params.id, request.body.type),
  )

  app.delete(
    '/posts/:id/reaction',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['reactions'],
        summary: '반응 취소',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        response: {
          200: reactionSummarySchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.remove(getUserId(request), request.params.id),
  )
}
