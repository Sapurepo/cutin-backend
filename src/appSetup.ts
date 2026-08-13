import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { allowedMimes } from './modules/media/mediaSchemas.ts'

/** 이미지 업로드 한 건의 상한 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/**
 * Fastify 인스턴스에 직접 해야 하는 설정. 부트스트랩과 테스트가 같은 것을 쓰도록 한곳에 모은다.
 * 이미지 본문은 파싱하지 않고 Buffer 그대로 받는다.
 */
export function applyFastifySetup(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance()
  fastify.addContentTypeParser(
    [...allowedMimes],
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
    (_request, body, done) => {
      done(null, body)
    },
  )
}
