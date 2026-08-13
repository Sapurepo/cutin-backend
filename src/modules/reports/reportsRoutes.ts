import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createReportsRepository } from './reportsRepository.ts'
import { createReportBodySchema, reportSchema } from './reportsSchemas.ts'
import { createReportsService } from './reportsService.ts'

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createReportsService(createReportsRepository(app.db))

  app.post(
    '/reports',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['reports'],
        summary: '신고 접수',
        description: '포스트·댓글·사용자를 신고한다. 같은 대상을 두 번 신고하면 409가 나간다.',
        security: [{ bearerAuth: [] }],
        body: createReportBodySchema,
        response: {
          201: reportSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const report = await service.create(getUserId(request), request.body)
      return reply.status(201).send(report)
    },
  )
}
