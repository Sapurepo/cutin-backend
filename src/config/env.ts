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
  /** 클라이언트에 내려줄 미디어 URL의 앞부분 */
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  /** 로컬 디스크 스토리지 구현이 쓰는 경로. 스토리지 벤더가 정해지면 사라진다. */
  STORAGE_DIR: z.string().default('./storage'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`환경변수 설정이 올바르지 않습니다:\n${issues}`)
}

export const env: Env = parsed.data
