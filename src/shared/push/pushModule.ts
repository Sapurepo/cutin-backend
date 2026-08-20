import { Global, Logger, Module } from '@nestjs/common'
import { env } from '../../config/env.ts'
import { createApnsPushService } from './apnsPushService.ts'
import type { PushMessage, PushResult, PushService } from './pushService.ts'

/** 테스트가 이 토큰만 바꿔 끼운다. */
export const PUSH = Symbol('PUSH')

/**
 * APNs 자격증명이 없을 때 쓰는 구현. 실제로 보내지 않고 무엇을 보냈을지만 남긴다.
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

/**
 * 자격증명 4종이 다 있으면 실제로 보내고, 다 없으면 로그만 남긴다.
 * 부분 설정은 `config/env.ts`의 refine이 부팅에서 막으므로 여기서 다시 보지 않는다.
 */
export function createPushService(): PushService {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID } = env
  if (
    APNS_KEY_ID === undefined ||
    APNS_TEAM_ID === undefined ||
    APNS_PRIVATE_KEY === undefined ||
    APNS_BUNDLE_ID === undefined
  ) {
    // 운영에서 이 줄이 보이면 푸시가 나가지 않고 있다는 뜻이다. 조용히 넘어가지 않는다.
    new Logger('PushService').warn('APNs 자격증명이 없어 푸시를 실제로 보내지 않습니다.')
    return createLoggingPushService()
  }

  return createApnsPushService({
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    // 한 줄 env로 넣은 PEM의 개행을 되살린다. 파일로 마운트했다면 그대로 통과한다.
    privateKey: APNS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    bundleId: APNS_BUNDLE_ID,
  })
}

@Global()
@Module({
  providers: [{ provide: PUSH, useFactory: createPushService }],
  exports: [PUSH],
})
export class PushModule {}
