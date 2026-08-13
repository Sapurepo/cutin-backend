import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { ZodValidationException } from 'nestjs-zod'
import { ZodError } from 'zod'
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

    // nestjs-zod는 BadRequestException을 던지므로 HttpException 분기보다 먼저 걸러야 한다.
    if (exception instanceof ZodValidationException) {
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: '요청 값이 올바르지 않습니다.',
            // `ZodParam`이 내는 것과 같은 모양(issue 배열)으로 맞춘다.
            // 클라이언트가 details를 한 가지로만 파싱하게 하기 위해서다.
            details: toIssues(exception.getZodError()),
          },
        },
      }
    }

    // Fastify가 본문을 읽다 실패한 경우. 상태 코드만 보면 원인을 구분할 수 없어
    // 드라이버 코드를 우리 어휘로 옮긴다 — "이미지가 너무 큼"은 사용자에게 보여줘야 한다.
    // Nest가 직접 던지는 예외(경로 없음, 본문 파서 실패 등). 메시지가 영문이라 우리 어휘로 바꾼다.
    // Fastify의 FST_ERR_* 코드는 어댑터가 HttpException으로 감싸면서 버리므로 상태로만 구분한다.
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      // 5xx는 응답 직렬화 실패 같은 서버 버그다. 메시지를 흘리지 않고 로그로 남긴다.
      if (status >= 500) return this.internalError(exception)

      const fallback = fallbacks[status]
      return {
        status,
        body: {
          error: {
            code: fallback?.code ?? 'BAD_REQUEST',
            message: fallback?.message ?? exception.message,
          },
        },
      }
    }

    return this.internalError(exception)
  }

  private internalError(exception: unknown): { status: number; body: ErrorResponse } {
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

function toIssues(error: unknown): unknown {
  return error instanceof ZodError ? error.issues : error
}

const fallbacks: Record<number, { code: string; message: string }> = {
  401: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' },
  403: { code: 'FORBIDDEN', message: '권한이 없습니다.' },
  404: { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' },
  409: { code: 'CONFLICT', message: '이미 존재하는 리소스입니다.' },
  // 업로드 상한(15MB)을 넘긴 경우. 사용자에게 보여줘야 하므로 일반 400과 구분한다.
  413: { code: 'PAYLOAD_TOO_LARGE', message: '업로드 용량이 너무 큽니다.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: '지원하지 않는 형식입니다.' },
}
