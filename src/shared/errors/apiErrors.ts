import { applyDecorators } from '@nestjs/common'
import { ApiResponse } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import { errorResponseSchema } from './errorSchemas.ts'

export class ErrorResponseDto extends createZodDto(errorResponseSchema) {}

const descriptions: Record<number, string> = {
  400: '요청 값이 올바르지 않음',
  401: '인증 필요',
  403: '권한 없음',
  404: '대상을 찾을 수 없음',
  409: '이미 존재하거나 충돌함',
  413: '업로드 용량 초과',
}

/**
 * 라우트가 낼 수 있는 오류 상태를 스펙에 싣는다.
 * iOS·어드민이 이 스펙으로 클라이언트를 생성하므로, 오류도 계약의 일부다.
 */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, type: ErrorResponseDto, description: descriptions[status] }),
    ),
  )
}
