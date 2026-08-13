import type { PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { AppError } from '../errors/appError.ts'

/**
 * 경로 파라미터 하나를 Zod로 검증한다.
 * 본문·쿼리는 DTO(`createZodDto`)로 전역 파이프가 처리하지만,
 * `@Param('id')`처럼 값 하나만 받는 자리는 스키마를 직접 걸어야 한다.
 */
export class ZodParam<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw AppError.badRequest(
        'VALIDATION_FAILED',
        '요청 값이 올바르지 않습니다.',
        result.error.issues,
      )
    }
    return result.data
  }
}
