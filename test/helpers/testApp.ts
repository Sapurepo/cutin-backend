import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.ts'
import { createDatabase, type DatabaseHandle } from '../../src/db/client.ts'
import { seedTemplates } from '../../src/db/seedTemplates.ts'
import type { OauthProfile, OauthVerifier } from '../../src/modules/auth/oauthVerifier.ts'
import { createLocalDiskStorage } from '../../src/shared/storage/localDiskStorage.ts'

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

export interface TestContext {
  app: FastifyInstance
  container: StartedPostgreSqlContainer
  database: DatabaseHandle
  oauth: OauthVerifierStub
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
  const app = await buildApp({
    db: database.db,
    oauthVerifier: oauth,
    storage: createLocalDiskStorage({ directory: storageDir, baseUrl: 'http://test.local' }),
  })
  await app.ready()
  return { app, container, database, oauth, storageDir }
}

export async function destroyTestContext(context: TestContext): Promise<void> {
  await context.app.close()
  await context.database.close()
  await context.container.stop()
  await rm(context.storageDir, { recursive: true, force: true })
}
