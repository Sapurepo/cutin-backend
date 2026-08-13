import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { ZodValidationException } from 'nestjs-zod'
import { AppError } from './appError.ts'
import type { ErrorResponse } from './errorSchemas.ts'

/**
 * 모든 오류 응답을 `{ error: { code, message, details? } }` 한 가지 모양으로 통일한다.
 * `code`는 iOS·어드민이 분기에 쓰는 안정적인 식별자다.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    const { status, body } = this.toResponse(exception)
    void reply.status(status).send(body)
  }

  private toResponse(exception: unknown): {
    status: number
    body: ErrorResponse
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.statusCode,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      }
    }

    // nestjs-zod는 BadRequestException을 던지므로 AppError보다 먼저 걸러야 한다.
    if (exception instanceof ZodValidationException) {
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: '요청 값이 올바르지 않습니다.',
            details: exception.getZodError(),
          },
        },
      }
    }

    // Nest가 직접 던지는 예외(경로 없음 등). 메시지가 영문이라 우리 어휘로 바꾼다.
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const fallback = fallbacks[status]
      return {
        status,
        body: {
          error: {
            code: fallback?.code ?? (status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'),
            message: fallback?.message ?? exception.message,
          },
        },
      }
    }

    this.logger.error(
      '처리되지 않은 오류',
      exception instanceof Error ? exception.stack : exception,
    )
    return {
      status: 500,
      body: {
        error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
      },
    }
  }
}

const fallbacks: Record<number, { code: string; message: string }> = {
  401: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' },
  403: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
  404: { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' },
  409: { code: 'CONFLICT', message: '이미 존재하는 리소스입니다.' },
}
