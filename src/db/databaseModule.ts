import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { env } from '../config/env.ts'
import { createDatabase, type Database, type DatabaseHandle } from './client.ts'

/** Drizzle 인스턴스를 주입받을 때 쓰는 토큰. 테스트는 이 토큰을 override한다. */
export const DATABASE = Symbol('DATABASE')

/**
 * 커넥션을 닫기 위해 필요하다.
 * 테스트는 컨테이너 커넥션을 직접 관리하므로 이 토큰도 함께 override한다.
 */
export const DATABASE_HANDLE = Symbol('DATABASE_HANDLE')

/**
 * 모든 도메인 모듈이 DB를 쓰므로 전역으로 둔다.
 * 모듈마다 `imports: [DatabaseModule]`을 반복하는 것보다 의도가 분명하다.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_HANDLE,
      useFactory: (): DatabaseHandle => createDatabase(env.DATABASE_URL),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_HANDLE],
      useFactory: (handle: DatabaseHandle): Database => handle.db,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close()
  }
}
