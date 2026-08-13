import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../config/env.ts'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createMediaRepository } from '../media/mediaRepository.ts'
import { createMediaService } from '../media/mediaService.ts'
import { userIdParamsSchema } from '../social/socialSchemas.ts'
import { createPostsRepository } from './postsRepository.ts'
import {
  createPostBodySchema,
  feedQuerySchema,
  postIdParamsSchema,
  postPageSchema,
  postSchema,
  publishPostBodySchema,
  shareLinkSchema,
  templatesResponseSchema,
  updatePostBodySchema,
} from './postsSchemas.ts'
import { createPostsService } from './postsService.ts'

export const postsRoutes: FastifyPluginAsyncZod = async (app) => {
  const mediaRepository = createMediaRepository(app.db)
  const service = createPostsService(
    createPostsRepository(app.db),
    mediaRepository,
    createMediaService(mediaRepository, app.storage),
    env.PUBLIC_BASE_URL,
  )

  app.get(
    '/templates',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '템플릿 목록',
        description: '컷 수와 레이아웃은 서버가 정의한다. 클라이언트가 컷 수를 가정하지 않는다.',
        security: [{ bearerAuth: [] }],
        response: { 200: templatesResponseSchema, 401: errorResponseSchema },
      },
    },
    async () => service.listTemplates(),
  )

  app.post(
    '/posts',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: 'draft 생성',
        description: 'draft는 사용자당 1개다. 이미 있으면 409가 나간다.',
        security: [{ bearerAuth: [] }],
        body: createPostBodySchema,
        response: {
          201: postSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const post = await service.createDraft(getUserId(request), request.body.templateId)
      return reply.status(201).send(post)
    },
  )

  app.get(
    '/posts/draft',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '작성 중인 draft 조회',
        description: '촬영 진입 시 이어쓰기 여부를 정하기 위해 부른다.',
        security: [{ bearerAuth: [] }],
        response: { 200: postSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => service.getDraft(getUserId(request)),
  )

  app.get(
    '/feed',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '피드',
        description: '내 글 + 전체공개 + 친구공개(맞팔)를 최신순으로 준다.',
        security: [{ bearerAuth: [] }],
        querystring: feedQuerySchema,
        response: { 200: postPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.feed(getUserId(request), request.query),
  )

  app.get(
    '/users/:id/posts',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '사용자 포스트 목록',
        description: '본인 id를 넣으면 기록 보관함이 된다. 노출 범위는 피드와 같은 규칙이다.',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        querystring: feedQuerySchema,
        response: { 200: postPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.listByAuthor(getUserId(request), request.params.id, request.query),
  )

  app.get(
    '/posts/:id',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '포스트 상세',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        response: { 200: postSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => service.getPost(getUserId(request), request.params.id),
  )

  app.get(
    '/posts/:id/share',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '공유 링크',
        description: '비공개 포스트는 공유할 수 없다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        response: {
          200: shareLinkSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.getShareLink(getUserId(request), request.params.id),
  )

  app.patch(
    '/posts/:id',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: 'draft 편집',
        description: 'cuts를 보내면 기존 컷을 전부 대체한다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        body: updatePostBodySchema,
        response: {
          200: postSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.updateDraft(request.params.id, getUserId(request), request.body),
  )

  app.post(
    '/posts/:id/publish',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '발행',
        description: '컷이 템플릿 수만큼 채워지고 합성본 업로드가 끝나야 발행된다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        body: publishPostBodySchema,
        response: {
          200: postSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.publish(request.params.id, getUserId(request), request.body),
  )

  app.delete(
    '/posts/:id',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['posts'],
        summary: '포스트 삭제 · draft 폐기',
        description: '소프트 삭제한다. draft를 지우면 새 draft를 만들 수 있다.',
        security: [{ bearerAuth: [] }],
        params: postIdParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await service.remove(request.params.id, getUserId(request))
      return reply.status(204).send(null)
    },
  )
}
