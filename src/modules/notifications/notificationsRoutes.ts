import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { cursorQuerySchema } from '../../shared/pagination/paginationSchemas.ts'
import { createNotificationsRepository } from './notificationsRepository.ts'
import {
  markReadBodySchema,
  notificationPageSchema,
  unreadCountSchema,
} from './notificationsSchemas.ts'
import { createNotificationsService } from './notificationsService.ts'

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createNotificationsService(createNotificationsRepository(app.db), app.storage)

  app.get(
    '/notifications',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['notifications'],
        summary: '인앱 알림 목록',
        security: [{ bearerAuth: [] }],
        querystring: cursorQuerySchema,
        response: {
          200: notificationPageSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => service.list(getUserId(request), request.query),
  )

  app.get(
    '/notifications/unread-count',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['notifications'],
        summary: '미읽음 개수',
        description: '탭 뱃지에 쓴다.',
        security: [{ bearerAuth: [] }],
        response: { 200: unreadCountSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.unreadCount(getUserId(request)),
  )

  app.post(
    '/notifications/read',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['notifications'],
        summary: '읽음 처리',
        description: '응답의 count는 읽음 처리 후 남은 미읽음 개수다.',
        security: [{ bearerAuth: [] }],
        body: markReadBodySchema,
        response: { 200: unreadCountSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.markRead(getUserId(request), request.body.ids),
  )
}
