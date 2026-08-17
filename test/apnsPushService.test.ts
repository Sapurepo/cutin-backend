import { generateKeyPairSync } from 'node:crypto'
import {
  createServer,
  type Http2Server,
  type IncomingHttpHeaders,
  type ServerHttp2Session,
  type ServerHttp2Stream,
} from 'node:http2'
import type { AddressInfo } from 'node:net'
import { importSPKI, jwtVerify } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApnsPushService } from '../src/shared/push/apnsPushService.ts'
import type { PushMessage } from '../src/shared/push/pushService.ts'

/**
 * 실제 APNs 대신 평문 HTTP/2 서버를 세워 어댑터를 검증한다.
 * 검증 대상은 둘이고, 이 어댑터에서 틀리기 쉬운 것도 그 둘뿐이다.
 * (1) 요청 형식 — 경로·헤더·페이로드·JWT
 * (2) 응답 해석 — 무엇을 폐기 대상으로 볼 것인가
 *
 * Testcontainers를 쓰지 않으므로 Docker 없이도 돈다.
 */

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

interface ReceivedRequest {
  headers: IncomingHttpHeaders
  body: string
}

/** 응답을 테스트가 지정한다. 지정이 없으면 200이다. */
type Responder = (headers: IncomingHttpHeaders) => { status: number; body?: string }

interface FakeApns {
  server: Http2Server
  origin: string
  received: ReceivedRequest[]
}

const sessions: ServerHttp2Session[] = []
let respondWith: Responder = () => ({ status: 200 })

/** 환경별로 다른 호스트에 붙는지 보려면 서버가 둘이어야 한다. */
let production: FakeApns
let sandbox: FakeApns

async function startFakeApns(): Promise<FakeApns> {
  const received: ReceivedRequest[] = []
  const server = createServer()

  server.on('session', (session) => sessions.push(session))
  server.on('stream', (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
    let body = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      body += chunk
    })
    stream.on('end', () => {
      received.push({ headers, body })
      const response = respondWith(headers)
      stream.respond({ ':status': response.status })
      stream.end(response.body ?? '')
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, origin: `http://127.0.0.1:${port}`, received }
}

beforeAll(async () => {
  production = await startFakeApns()
  sandbox = await startFakeApns()
})

afterAll(async () => {
  for (const session of sessions) session.destroy()
  await Promise.all(
    [production, sandbox].map(
      ({ server }) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
})

beforeEach(() => {
  production.received.length = 0
  sandbox.received.length = 0
  respondWith = () => ({ status: 200 })
})

function createService() {
  return createApnsPushService({
    keyId: 'KEY123',
    teamId: 'TEAM456',
    privateKey,
    bundleId: 'app.getcutin.ios',
    hosts: { sandbox: sandbox.origin, production: production.origin },
  })
}

function message(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    pushToken: 'device-token-a',
    pushEnvironment: 'production',
    title: 'CUTIN',
    body: '오늘의 한 컷을 남겨볼까요?',
    ...overrides,
  }
}

describe('APNs 어댑터 — 요청 형식', () => {
  it('디바이스 토큰이 경로에 들어가고 bundle id가 apns-topic으로 나간다', async () => {
    const result = await createService().send([message()])

    expect(result).toEqual({ sent: 1, invalidTokens: [] })
    expect(production.received).toHaveLength(1)

    const { headers } = production.received[0] as ReceivedRequest
    expect(headers[':path']).toBe('/3/device/device-token-a')
    expect(headers[':method']).toBe('POST')
    expect(headers['apns-topic']).toBe('app.getcutin.ios')
    // iOS 13부터 필수다. 빠지면 APNs가 요청 자체를 거부한다.
    expect(headers['apns-push-type']).toBe('alert')
  })

  it('알림 문구와 data가 aps 페이로드로 실린다', async () => {
    await createService().send([message({ data: { targetType: 'post', targetId: 'post-1' } })])

    expect(JSON.parse((production.received[0] as ReceivedRequest).body)).toEqual({
      aps: {
        alert: { title: 'CUTIN', body: '오늘의 한 컷을 남겨볼까요?' },
        sound: 'default',
      },
      targetType: 'post',
      targetId: 'post-1',
    })
  })

  it('authorization 헤더의 JWT가 ES256으로 서명되고 kid·iss를 담는다', async () => {
    await createService().send([message()])

    const authorization = String((production.received[0] as ReceivedRequest).headers.authorization)
    expect(authorization.startsWith('bearer ')).toBe(true)

    const { payload, protectedHeader } = await jwtVerify(
      authorization.slice('bearer '.length),
      await importSPKI(publicKey, 'ES256'),
    )
    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'KEY123' })
    expect(payload.iss).toBe('TEAM456')
    expect(typeof payload.iat).toBe('number')
  })

  it('provider 토큰을 한 번만 서명해 재사용한다', async () => {
    // APNs는 20분보다 잦은 재발급을 거부한다(TooManyProviderTokenUpdates).
    const service = createService()
    await service.send([message({ pushToken: 'token-a' }), message({ pushToken: 'token-b' })])
    await service.send([message({ pushToken: 'token-c' })])

    const signed = new Set(production.received.map((request) => request.headers.authorization))
    expect(production.received).toHaveLength(3)
    expect(signed.size).toBe(1)
  })
})

describe('APNs 어댑터 — 환경 분기', () => {
  it('sandbox 디바이스와 production 디바이스가 서로 다른 호스트로 나간다', async () => {
    await createService().send([
      message({ pushToken: 'sandbox-token', pushEnvironment: 'sandbox' }),
      message({ pushToken: 'production-token', pushEnvironment: 'production' }),
    ])

    expect(sandbox.received.map((request) => request.headers[':path'])).toEqual([
      '/3/device/sandbox-token',
    ])
    expect(production.received.map((request) => request.headers[':path'])).toEqual([
      '/3/device/production-token',
    ])
  })
})

describe('APNs 어댑터 — 응답 해석', () => {
  it('410 Unregistered면 토큰을 폐기 대상으로 돌려준다', async () => {
    respondWith = () => ({ status: 410, body: JSON.stringify({ reason: 'Unregistered' }) })

    expect(await createService().send([message()])).toEqual({
      sent: 0,
      invalidTokens: ['device-token-a'],
    })
  })

  it('400 BadDeviceToken이면 토큰을 폐기 대상으로 돌려준다', async () => {
    respondWith = () => ({ status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) })

    expect(await createService().send([message()])).toEqual({
      sent: 0,
      invalidTokens: ['device-token-a'],
    })
  })

  it('5xx는 폐기하지 않는다 — APNs 장애 한 번에 유효 토큰이 날아가면 안 된다', async () => {
    respondWith = () => ({ status: 500, body: JSON.stringify({ reason: 'InternalServerError' }) })

    expect(await createService().send([message()])).toEqual({ sent: 0, invalidTokens: [] })
  })

  it('400이어도 이유가 BadDeviceToken이 아니면 폐기하지 않는다', async () => {
    respondWith = () => ({ status: 400, body: JSON.stringify({ reason: 'BadTopic' }) })

    expect(await createService().send([message()])).toEqual({ sent: 0, invalidTokens: [] })
  })

  it('성공과 폐기가 섞여도 폐기 대상 토큰만 정확히 짚는다', async () => {
    respondWith = (headers) =>
      headers[':path'] === '/3/device/dead-token'
        ? { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) }
        : { status: 200 }

    const result = await createService().send([
      message({ pushToken: 'live-token' }),
      message({ pushToken: 'dead-token' }),
      message({ pushToken: 'another-live-token' }),
    ])

    expect(result.sent).toBe(2)
    expect(result.invalidTokens).toEqual(['dead-token'])
  })

  it('보낼 메시지가 없으면 연결조차 하지 않는다', async () => {
    const before = sessions.length

    expect(await createService().send([])).toEqual({ sent: 0, invalidTokens: [] })
    expect(sessions.length).toBe(before)
  })
})
