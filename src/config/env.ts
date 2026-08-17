import { existsSync } from 'node:fs'
import { z } from 'zod'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, '32자 이상이어야 합니다'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  /** 서버 자신의 공개 주소. 업로드 목적지와 포스트 공유 링크의 앞부분이다 */
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  /**
   * 클라이언트에 내려줄 미디어 URL의 앞부분. CDN이 붙으면 여기만 갈라진다.
   * 미설정 시 `PUBLIC_BASE_URL`을 쓴다 — default를 두지 않는 이유는
   * Zod default로는 다른 필드를 참조할 수 없기 때문이다.
   */
  MEDIA_BASE_URL: z.url().optional(),
  /** 로컬 디스크 스토리지 구현이 쓰는 경로. 스토리지 벤더가 정해지면 사라진다. */
  STORAGE_DIR: z.string().default('./storage'),
  /**
   * APNs 자격 4종. 넷 다 있으면 실제로 발송하고, 넷 다 없으면 로그만 남기는 구현으로 남는다.
   * 일부만 설정하는 것은 아래 refine에서 부팅 실패로 막는다.
   */
  APNS_KEY_ID: z.string().min(1).optional(),
  APNS_TEAM_ID: z.string().min(1).optional(),
  /** `.p8` 파일 내용(PKCS#8 PEM). 한 줄 env로 넣을 때의 `\n`은 읽는 쪽에서 복원한다. */
  APNS_PRIVATE_KEY: z.string().min(1).optional(),
  /** `apns-topic`에 들어가는 앱 bundle id. 빌드 configuration마다 다르다. */
  APNS_BUNDLE_ID: z.string().min(1).optional(),
})

const apnsKeys = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_BUNDLE_ID'] as const

/**
 * 부분 설정을 막는다. 하나라도 빠지면 조용히 로깅 구현으로 떨어져
 * "설정했는데 푸시가 안 온다"가 되는데, 이건 원인이 서버 로그에도 드러나지 않는다.
 */
const envSchemaWithApnsCheck = envSchema.refine(
  (value) => {
    const present = apnsKeys.filter((key) => value[key] !== undefined)
    return present.length === 0 || present.length === apnsKeys.length
  },
  {
    path: ['APNS_KEY_ID'],
    message: `APNs 설정은 ${apnsKeys.join(' · ')} 넷을 모두 채우거나 모두 비워야 합니다`,
  },
)

export type Env = z.infer<typeof envSchema>

const parsed = envSchemaWithApnsCheck.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`환경변수 설정이 올바르지 않습니다:\n${issues}`)
}

export const env: Env = parsed.data
