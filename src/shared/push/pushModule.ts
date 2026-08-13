import { Global, Logger, Module } from '@nestjs/common'
import type { PushMessage, PushResult, PushService } from './pushService.ts'

/** 인프라 미정 구간. 벤더가 정해지면 이 토큰의 구현만 바꾼다. */
export const PUSH = Symbol('PUSH')

/**
 * APNs가 붙기 전까지 쓰는 구현. 실제로 보내지 않고 무엇을 보냈을지만 남긴다.
 * 잡이 대상을 제대로 고르는지는 이 로그로 확인할 수 있다.
 */
export function createLoggingPushService(): PushService {
  const logger = new Logger('PushService')
  return {
    async send(messages: PushMessage[]): Promise<PushResult> {
      for (const message of messages) {
        logger.log(`푸시(미발송): ${message.title} → ${message.pushToken.slice(0, 8)}…`)
      }
      return { sent: messages.length, invalidTokens: [] }
    },
  }
}

@Global()
@Module({
  providers: [{ provide: PUSH, useFactory: createLoggingPushService }],
  exports: [PUSH],
})
export class PushModule {}
