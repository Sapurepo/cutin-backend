import type { FastifyError, FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import { AppError } from './appError.ts'

/**
 * 모든 오류 응답을 `{ error: { code, message, details? } }` 한 가지 모양으로 통일한다.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '요청 값이 올바르지 않습니다.',
          details: error.validation,
        },
      })
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, '응답 직렬화 실패')
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
      })
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      })
    }

    const fastifyError = error as FastifyError
    if (fastifyError.statusCode !== undefined && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        error: { code: fastifyError.code ?? 'BAD_REQUEST', message: fastifyError.message },
      })
    }

    request.log.error({ err: error }, '처리되지 않은 오류')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
    })
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' },
    })
  })
}
