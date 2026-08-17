import type { PushEnvironment } from '../../db/schema/index.ts'

/**
 * 푸시 발송. APNs가 확정되기 전까지 인터페이스로만 다룬다.
 * 도메인 코드가 벤더 SDK를 직접 부르지 않게 하는 것이 목적이다.
 */
export interface PushService {
  /** 한 번에 여러 디바이스로 보낸다. 실패한 토큰은 삼키지 않고 돌려준다. */
  send(messages: PushMessage[]): Promise<PushResult>
}

export interface PushMessage {
  pushToken: string
  /** 토큰과 한 쌍이다. 어댑터가 이 값으로 APNs 엔드포인트를 고른다 */
  pushEnvironment: PushEnvironment
  title: string
  body: string
  /** 클라이언트가 탭했을 때 이동할 곳. 인앱 알림의 targetType·targetId와 같은 값이다. */
  data?: Record<string, string>
}

export interface PushResult {
  sent: number
  /** 더 이상 유효하지 않은 토큰. 호출부가 폐기한다. */
  invalidTokens: string[]
}
