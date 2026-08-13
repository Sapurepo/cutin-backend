import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createMediaRepository } from './mediaRepository.ts'
import {
  allowedMimes,
  completeUploadBodySchema,
  createUploadBodySchema,
  mediaIdParamsSchema,
  mediaSchema,
  storageKeyParamsSchema,
  uploadTargetSchema,
} from './mediaSchemas.ts'
import { createMediaService } from './mediaService.ts'

const maxUploadBytes = 15 * 1024 * 1024

export const mediaRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createMediaService(createMediaRepository(app.db), app.storage)

  // 이미지 본문은 파싱하지 않고 그대로 받는다.
  app.addContentTypeParser([...allowedMimes], { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  app.post(
    '/media/uploads',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['media'],
        summary: '업로드 목적지 발급',
        description:
          '미디어를 pending으로 만들고 바이트를 보낼 곳을 알려준다. 업로드 후 complete를 호출해야 포스트에 붙일 수 있다.',
        security: [{ bearerAuth: [] }],
        body: createUploadBodySchema,
        response: {
          201: uploadTargetSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const target = await service.createUpload(getUserId(request), request.body)
      return reply.status(201).send(target)
    },
  )

  app.put(
    '/media/content/*',
    {
      onRequest: requireAuth,
      bodyLimit: maxUploadBytes,
      schema: {
        tags: ['media'],
        summary: '이미지 업로드',
        description: '`POST /media/uploads`가 준 URL로 이미지 바이트를 그대로 PUT한다.',
        security: [{ bearerAuth: [] }],
        params: storageKeyParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await service.putContent(request.params['*'], getUserId(request), request.body as Buffer)
      return reply.status(204).send(null)
    },
  )

  app.get(
    '/media/content/*',
    {
      schema: {
        tags: ['media'],
        summary: '이미지 조회',
        description:
          '키에 소유자·미디어 id가 들어가 추측할 수 없으므로 인증을 요구하지 않는다. 응답은 JSON이 아니라 이미지 바이트다.',
        params: storageKeyParamsSchema,
      },
    },
    async (request, reply) => {
      const { body, mime } = await service.readContent(request.params['*'])
      return reply.header('content-type', mime).send(body)
    },
  )

  app.post(
    '/media/:id/complete',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['media'],
        summary: '업로드 완료 처리',
        security: [{ bearerAuth: [] }],
        params: mediaIdParamsSchema,
        body: completeUploadBodySchema,
        response: {
          200: mediaSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.complete(request.params.id, getUserId(request), request.body),
  )
}
