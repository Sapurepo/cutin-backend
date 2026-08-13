import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { AppModule } from '../../src/appModule.ts'
import { applyFastifySetup } from '../../src/appSetup.ts'
import { createDatabase, type DatabaseHandle } from '../../src/db/client.ts'
import { DATABASE, DATABASE_HANDLE } from '../../src/db/databaseModule.ts'
import { seedTemplates } from '../../src/db/seedTemplates.ts'
import type { OauthProfile, OauthVerifier } from '../../src/modules/auth/oauthVerifier.ts'
import { OAUTH_VERIFIER } from '../../src/modules/auth/oauthVerifier.ts'
import { PUSH } from '../../src/shared/push/pushModule.ts'
import type { PushMessage, PushResult, PushService } from '../../src/shared/push/pushService.ts'
import { createLocalDiskStorage } from '../../src/shared/storage/localDiskStorage.ts'
import { STORAGE } from '../../src/shared/storage/storageModule.ts'

/**
 * 프로바이더 호출 없이 로그인 플로우를 돌리기 위한 스텁.
 * 테스트가 `stub.setProfile(...)`로 다음 검증 결과를 지정한다.
 */
export interface OauthVerifierStub extends OauthVerifier {
  setProfile(profile: OauthProfile): void
}

function createOauthVerifierStub(): OauthVerifierStub {
  let next: OauthProfile | undefined
  return {
    setProfile(profile) {
      next = profile
    },
    async verify() {
      if (next === undefined) throw new Error('스텁 프로필이 설정되지 않았습니다.')
      return next
    },
  }
}

/** 실제로 보내지 않고 무엇을 보냈는지만 모은다. */
export interface PushServiceStub extends PushService {
  sent: PushMessage[]
  invalidTokens: string[]
  reset(): void
}

function createPushServiceStub(): PushServiceStub {
  const stub: PushServiceStub = {
    sent: [],
    invalidTokens: [],
    reset() {
      stub.sent = []
      stub.invalidTokens = []
    },
    async send(messages: PushMessage[]): Promise<PushResult> {
      stub.sent.push(...messages)
      return { sent: messages.length, invalidTokens: stub.invalidTokens }
    },
  }
  return stub
}

export interface TestContext {
  app: NestFastifyApplication
  container: StartedPostgreSqlContainer
  database: DatabaseHandle
  oauth: OauthVerifierStub
  push: PushServiceStub
  storageDir: string
}

/**
 * 테스트 1파일당 한 번 호출한다. Postgres 컨테이너를 띄우고 앱을 그 위에 붙인다.
 * 미디어는 임시 디렉터리에 쓰므로 프로젝트 디렉터리를 더럽히지 않는다.
 */
export async function createTestContext(): Promise<TestContext> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const database = createDatabase(container.getConnectionUri())
  await migrate(database.db, { migrationsFolder: 'src/db/migrations' })
  await seedTemplates(database.db)

  const storageDir = await mkdtemp(join(tmpdir(), 'cutin-test-'))
  const oauth = createOauthVerifierStub()
  const push = createPushServiceStub()

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE)
    .useValue(database.db)
    // 커넥션 수명은 테스트가 직접 관리한다. 앱이 닫지 않도록 no-op 핸들을 준다.
    .overrideProvider(DATABASE_HANDLE)
    .useValue({
      db: database.db,
      close: async () => {},
    } satisfies DatabaseHandle)
    .overrideProvider(STORAGE)
    .useValue(
      createLocalDiskStorage({
        directory: storageDir,
        baseUrl: 'http://test.local',
      }),
    )
    .overrideProvider(OAUTH_VERIFIER)
    .useValue(oauth)
    .overrideProvider(PUSH)
    .useValue(push)
    .compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })
  applyFastifySetup(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return { app, container, database, oauth, push, storageDir }
}

export async function destroyTestContext(context: TestContext): Promise<void> {
  await context.app.close()
  await context.database.close()
  await context.container.stop()
  await rm(context.storageDir, { recursive: true, force: true })
}
