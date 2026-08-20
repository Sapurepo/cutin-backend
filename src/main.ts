import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './appModule.ts'
import { applyFastifySetup } from './appSetup.ts'
import { env } from './config/env.ts'
import { setupOpenapi } from './openapi.ts'

function loggerOptions() {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss' },
      },
    }
  }
  return { level: env.LOG_LEVEL }
}

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: loggerOptions() }),
)

// SIGINT·SIGTERM에서 onApplicationShutdown 훅이 돌아 DB 커넥션을 닫는다.
applyFastifySetup(app)
app.enableShutdownHooks()
setupOpenapi(app)

await app.listen({ host: env.HOST, port: env.PORT })
