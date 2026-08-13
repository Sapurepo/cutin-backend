import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { cursorQuerySchema } from '../../shared/pagination/paginationSchemas.ts'
import { createNotificationsRepository } from '../notifications/notificationsRepository.ts'
import { createSocialRepository } from './socialRepository.ts'
import {
  followResultSchema,
  publicProfileSchema,
  recommendedUsersSchema,
  recommendQuerySchema,
  searchQuerySchema,
  userIdParamsSchema,
  userPageSchema,
} from './socialSchemas.ts'
import { createSocialService } from './socialService.ts'

export const socialRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createSocialService(
    createSocialRepository(app.db),
    createNotificationsRepository(app.db),
    app.storage,
  )

  app.post(
    '/users/:id/follow',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '팔로우',
        description: '상대도 나를 팔로우 중이면 친구(맞팔)가 되어 friend가 true로 돌아온다.',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        response: {
          200: followResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.follow(getUserId(request), request.params.id),
  )

  app.delete(
    '/users/:id/follow',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '언팔로우',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.unfollow(getUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/users/:id/block',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '차단',
        description: '차단 즉시 양방향 팔로우와 친구 관계가 끊긴다.',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.block(getUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  app.delete(
    '/users/:id/block',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '차단 해제',
        description: '차단을 풀어도 끊어진 팔로우는 복구되지 않는다.',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await service.unblock(getUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  app.get(
    '/users/me/followers',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '나를 팔로우하는 사용자',
        security: [{ bearerAuth: [] }],
        querystring: cursorQuerySchema,
        response: { 200: userPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.listFollowers(getUserId(request), request.query),
  )

  app.get(
    '/users/me/followees',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '내가 팔로우하는 사용자',
        security: [{ bearerAuth: [] }],
        querystring: cursorQuerySchema,
        response: { 200: userPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.listFollowees(getUserId(request), request.query),
  )

  app.get(
    '/users/me/friends',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '친구 목록',
        description: '맞팔이 성립한 사용자만 나온다.',
        security: [{ bearerAuth: [] }],
        querystring: cursorQuerySchema,
        response: { 200: userPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.listFriends(getUserId(request), request.query),
  )

  app.get(
    '/users/search',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '닉네임 검색',
        security: [{ bearerAuth: [] }],
        querystring: searchQuerySchema,
        response: { 200: userPageSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const { q, ...page } = request.query
      return service.search(getUserId(request), q, page)
    },
  )

  app.get(
    '/users/recommended',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '추천 친구',
        description: '공통 친구가 많은 순으로 채우고, 모자라면 최근 가입자로 메운다.',
        security: [{ bearerAuth: [] }],
        querystring: recommendQuerySchema,
        response: { 200: recommendedUsersSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.recommend(getUserId(request), request.query.limit),
  )

  app.get(
    '/users/:id',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['social'],
        summary: '타인 프로필',
        security: [{ bearerAuth: [] }],
        params: userIdParamsSchema,
        response: {
          200: publicProfileSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => service.getProfile(getUserId(request), request.params.id),
  )
}
