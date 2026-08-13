import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { getUserId, requireAuth } from '../../shared/auth/authHook.ts'
import { errorResponseSchema } from '../../shared/errors/errorSchemas.ts'
import { createMediaRepository } from '../media/mediaRepository.ts'
import { createUsersRepository } from './usersRepository.ts'
import {
  nicknameAvailabilityQuerySchema,
  nicknameAvailabilityResponseSchema,
  notificationPreferencesBodySchema,
  notificationPreferencesResponseSchema,
  updateMeBodySchema,
  userProfileSchema,
} from './usersSchemas.ts'
import { createUsersService } from './usersService.ts'

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createUsersService(
    createUsersRepository(app.db),
    createMediaRepository(app.db),
    app.storage,
  )

  app.get(
    '/users/me',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '내 프로필',
        security: [{ bearerAuth: [] }],
        response: { 200: userProfileSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.getMe(getUserId(request)),
  )

  app.get(
    '/users/nickname/availability',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '닉네임 사용 가능 여부',
        security: [{ bearerAuth: [] }],
        querystring: nicknameAvailabilityQuerySchema,
        response: { 200: nicknameAvailabilityResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.checkNicknameAvailability(request.query.nickname),
  )

  app.patch(
    '/users/me',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '내 프로필 수정',
        security: [{ bearerAuth: [] }],
        body: updateMeBodySchema,
        response: {
          200: userProfileSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => service.updateMe(getUserId(request), request.body),
  )

  app.get(
    '/users/me/notification-preferences',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '알림 선호 시간대 조회',
        security: [{ bearerAuth: [] }],
        response: { 200: notificationPreferencesResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.getPreferences(getUserId(request)),
  )

  app.put(
    '/users/me/notification-preferences',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '알림 선호 시간대 설정',
        description: '4개 슬롯 중 다중 선택. 리마인더성 푸시만 이 슬롯에 예약된다.',
        security: [{ bearerAuth: [] }],
        body: notificationPreferencesBodySchema,
        response: { 200: notificationPreferencesResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.updatePreferences(getUserId(request), request.body),
  )

  app.post(
    '/users/me/onboarding/complete',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['users'],
        summary: '온보딩 완료',
        security: [{ bearerAuth: [] }],
        response: { 200: userProfileSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => service.completeOnboarding(getUserId(request)),
  )
}
