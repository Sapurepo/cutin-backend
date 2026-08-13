import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { env } from './config/env.ts'
import type { Database } from './db/client.ts'
import { authRoutes } from './modules/auth/authRoutes.ts'
import { httpOauthVerifier, type OauthVerifier } from './modules/auth/oauthVerifier.ts'
import { commentsRoutes } from './modules/comments/commentsRoutes.ts'
import { healthRoutes } from './modules/health/healthRoutes.ts'
import { mediaRoutes } from './modules/media/mediaRoutes.ts'
import { notificationsRoutes } from './modules/notifications/notificationsRoutes.ts'
import { postsRoutes } from './modules/posts/postsRoutes.ts'
import { reactionsRoutes } from './modules/reactions/reactionsRoutes.ts'
import { reportsRoutes } from './modules/reports/reportsRoutes.ts'
import { socialRoutes } from './modules/social/socialRoutes.ts'
import { usersRoutes } from './modules/users/usersRoutes.ts'
import { registerErrorHandler } from './shared/errors/errorHandler.ts'
import { createLocalDiskStorage } from './shared/storage/localDiskStorage.ts'
import type { StorageService } from './shared/storage/storageService.ts'

export interface AppOptions {
  db: Database
  /** 테스트에서 프로바이더 응답을 스텁하기 위한 주입점 */
  oauthVerifier?: OauthVerifier
  /** 인프라 미정 구간. 기본값은 로컬 디스크 구현이다. */
  storage?: StorageService
}

function buildLoggerOptions() {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }
  }
  return { level: env.LOG_LEVEL }
}

export async function buildApp({
  db,
  oauthVerifier = httpOauthVerifier,
  storage = createLocalDiskStorage({
    directory: env.STORAGE_DIR,
    baseUrl: env.PUBLIC_BASE_URL,
  }),
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: buildLoggerOptions() })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('db', db)
  app.decorate('oauthVerifier', oauthVerifier)
  app.decorate('storage', storage)

  registerErrorHandler(app)

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'CUTIN API',
        description: 'CUTIN 서비스 API. iOS 클라이언트와 어드민이 함께 사용한다.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(usersRoutes)
  await app.register(socialRoutes)
  await app.register(mediaRoutes)
  await app.register(postsRoutes)
  await app.register(commentsRoutes)
  await app.register(reactionsRoutes)
  await app.register(notificationsRoutes)
  await app.register(reportsRoutes)

  return app
}
