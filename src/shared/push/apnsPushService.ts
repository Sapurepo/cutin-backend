import { type ClientHttp2Session, type ClientHttp2Stream, connect, constants } from 'node:http2'
import { Logger } from '@nestjs/common'
import { importPKCS8, SignJWT } from 'jose'
import type { PushEnvironment } from '../../db/schema/index.ts'
import type { PushMessage, PushResult, PushService } from './pushService.ts'

/**
 * APNs HTTP/2 어댑터.
 *
 * `.p8` 하나가 sandbox·production 양쪽에 쓰이고 **호스트만 다르다.** 그래서 환경은
 * 서버 전역 설정이 아니라 메시지마다 실려 오고(`PushMessage.pushEnvironment`),
 * 여기서 환경별로 연결을 따로 잡는다. TestFlight 빌드(production 토큰)를 스테이징 서버에
 * 붙여도 섞이지 않는 이유가 이것이다.
 */
export interface ApnsConfig {
  keyId: string
  teamId: string
  /** `.p8` 파일 내용(PKCS#8 PEM). 한 줄 env로 넣었다면 `\n`을 복원해서 넘긴다 */
  privateKey: string
  /** `apns-topic` 헤더에 들어가는 앱 bundle id */
  bundleId: string
  /** 테스트가 로컬 HTTP/2 서버를 가리키기 위한 자리. 운영에서는 넘기지 않는다 */
  hosts?: Record<PushEnvironment, string>
}

const defaultHosts: Record<PushEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
}

/**
 * APNs는 1시간이 지난 provider 토큰을 거부하고, **20분보다 잦은 재발급도** 거부한다
 * (`TooManyProviderTokenUpdates`). 그 사이 값으로 잡아 양쪽을 모두 피한다.
 */
const TOKEN_TTL_MS = 50 * 60 * 1000

/** 폐기해야 하는 토큰임을 APNs가 알려주는 유일한 두 신호. */
const UNREGISTERED_STATUS = 410
const BAD_DEVICE_TOKEN = 'BadDeviceToken'

type Outcome =
  | { kind: 'sent' }
  | { kind: 'invalid' }
  /** 일시적 실패. 재시도 대상이지 폐기 대상이 아니다 */
  | { kind: 'failed' }

export function createApnsPushService(config: ApnsConfig): PushService {
  const logger = new Logger('ApnsPushService')
  const hosts = config.hosts ?? defaultHosts
  const sessions = new Map<PushEnvironment, ClientHttp2Session>()

  let signingKey: ReturnType<typeof importPKCS8> | undefined
  let cachedToken: { value: string; expiresAt: number } | undefined

  async function providerToken(): Promise<string> {
    const now = Date.now()
    if (cachedToken !== undefined && cachedToken.expiresAt > now) return cachedToken.value

    signingKey ??= importPKCS8(config.privateKey, 'ES256')
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt()
      .sign(await signingKey)

    cachedToken = { value, expiresAt: now + TOKEN_TTL_MS }
    return value
  }

  /**
   * 환경당 연결 하나를 재사용한다. APNs는 주기적으로 GOAWAY를 보내므로
   * 연결이 끊기는 것은 예외가 아니라 정상 경로다 — 캐시에서 지워 다음 발송이 새로 연결하게 한다.
   */
  function sessionFor(environment: PushEnvironment): ClientHttp2Session {
    const existing = sessions.get(environment)
    if (existing !== undefined && !existing.closed && !existing.destroyed) return existing

    const created = connect(hosts[environment])
    const forget = () => {
      if (sessions.get(environment) === created) sessions.delete(environment)
    }
    created.on('close', forget)
    created.on('error', (error) => {
      forget()
      logger.error(`APNs 연결 오류 (${environment}): ${error.message}`)
    })
    // 발송 중이 아닐 때 이 연결이 프로세스 종료를 붙들지 않게 한다.
    created.unref()

    sessions.set(environment, created)
    return created
  }

  function sendOne(message: PushMessage, jwt: string): Promise<Outcome> {
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
        ...message.data,
      })

      let stream: ClientHttp2Stream
      try {
        stream = sessionFor(message.pushEnvironment).request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: `/3/device/${message.pushToken}`,
          [constants.HTTP2_HEADER_AUTHORIZATION]: `bearer ${jwt}`,
          [constants.HTTP2_HEADER_CONTENT_TYPE]: 'application/json',
          'apns-topic': config.bundleId,
          // iOS 13부터 필수다. 빠뜨리면 APNs가 요청 자체를 거부한다.
          'apns-push-type': 'alert',
          'apns-priority': '10',
        })
      } catch (error) {
        logger.error(`APNs 요청 생성 실패: ${error instanceof Error ? error.message : error}`)
        resolve({ kind: 'failed' })
        return
      }

      let status = 0
      let body = ''

      stream.setEncoding('utf8')
      stream.on('response', (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0)
      })
      stream.on('data', (chunk: string) => {
        body += chunk
      })
      stream.on('error', (error) => {
        logger.error(`APNs 스트림 오류: ${error.message}`)
        resolve({ kind: 'failed' })
      })
      stream.on('end', () => resolve(classify(status, body)))

      stream.end(payload)
    })
  }

  /**
   * **폐기는 410(Unregistered)과 400 `BadDeviceToken`에만 한정한다.**
   * 5xx·네트워크 오류까지 폐기로 처리하면 APNs 장애 한 번에 유효한 토큰이 전부 날아가고,
   * 사용자는 앱을 지웠다 깔기 전까지 푸시를 영영 못 받는다.
   */
  function classify(status: number, body: string): Outcome {
    if (status >= 200 && status < 300) return { kind: 'sent' }

    const reason = parseReason(body)
    if (status === UNREGISTERED_STATUS || reason === BAD_DEVICE_TOKEN) return { kind: 'invalid' }

    // 서명 토큰이 만료된 상태로 굳지 않게 캐시를 버린다. 다음 발송이 새로 서명한다.
    if (reason === 'ExpiredProviderToken') cachedToken = undefined

    logger.error(`APNs 발송 실패 (status ${status}${reason === undefined ? '' : `, ${reason}`})`)
    return { kind: 'failed' }
  }

  return {
    async send(messages: PushMessage[]): Promise<PushResult> {
      if (messages.length === 0) return { sent: 0, invalidTokens: [] }

      const jwt = await providerToken()
      const outcomes = await Promise.all(messages.map((message) => sendOne(message, jwt)))

      const invalidTokens = messages
        .filter((_, index) => outcomes[index]?.kind === 'invalid')
        .map((message) => message.pushToken)

      return {
        sent: outcomes.filter((outcome) => outcome.kind === 'sent').length,
        invalidTokens,
      }
    },
  }
}

function parseReason(body: string): string | undefined {
  if (body === '') return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null && 'reason' in parsed) {
      const { reason } = parsed as { reason: unknown }
      if (typeof reason === 'string') return reason
    }
  } catch {
    // APNs가 JSON이 아닌 본문을 준 경우. 이유를 모를 뿐 실패라는 사실은 status가 말한다.
  }
  return undefined
}
