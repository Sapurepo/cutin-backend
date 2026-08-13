import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { cursorQuerySchema } from '../../shared/pagination/paginationSchemas.ts'
import { createNotificationsRepository } from '../notifications/notificationsRepository.ts'
import { createPostsRepository } from '../posts/postsRepository.ts'
import { postIdParamsSchema } from '../posts/postsSchemas.ts'
import { createCommentsRepository } from './commentsRepository.ts'
import {
  commentIdParamsSchema,
  commentPageSchema,
  commentSchema,
  createCommentBodySchema,
} from './commentsSchemas.ts'
import { createCommentsService } from './commentsService.ts'

export const commentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createCommentsService(
    createCommentsRepository(app.db),
    createPostsRepository(app.db),
    createNotificationsRepository(app.db),
    app.storage,
  )

  app.get(
    '/posts/:id/comments',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['comments'],
        summary: '댓글 목록',
        description: '오래된 댓글부터 준다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: commentPageSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.list(getUserId(request), request.params.id, request.query),
  )

  app.post(
    '/posts/:id/comments',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['comments'],
        summary: '댓글 작성',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        body: createCommentBodySchema,
        response: {
          201: commentSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const comment = await service.create(getUserId(request), request.params.id, request.body.body)
      return reply.status(201).send(comment)
    },
  )

  app.delete(
    '/posts/:id/comments/:commentId',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['comments'],
        summary: '댓글 삭제',
        description: '댓글 작성자와 포스트 작성자가 지울 수 있다.',
        security: [{ bearerAuth: [] }],
        params: commentIdParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.remove(getUserId(request), request.params.id, request.params.commentId)
      return reply.status(204).send(null)
    },
  )
}
