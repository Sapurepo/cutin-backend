import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

/**
 * iOS·어드민이 이 스펙으로 클라이언트를 생성하므로 라우트 스키마가 곧 API 계약이다.
 * `cleanupOpenApiDoc`이 nestjs-zod가 남긴 중간 표현을 정리한다.
 */
export function buildOpenapiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CUTIN API')
    .setDescription('CUTIN 서비스 API. iOS 클라이언트와 어드민이 함께 사용한다.')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .build()

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
}

export function setupOpenapi(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenapiDocument(app))
}
