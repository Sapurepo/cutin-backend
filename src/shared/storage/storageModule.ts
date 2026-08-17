import { Global, Module } from '@nestjs/common'
import { env } from '../../config/env.ts'
import { createLocalDiskStorage } from './localDiskStorage.ts'
import type { StorageService } from './storageService.ts'

/** 인프라 미정 구간. 테스트와 벤더 교체가 이 토큰만 바꿔 끼운다. */
export const STORAGE = Symbol('STORAGE')

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      useFactory: (): StorageService =>
        createLocalDiskStorage({
          directory: env.STORAGE_DIR,
          uploadBaseUrl: env.PUBLIC_BASE_URL,
          mediaBaseUrl: env.MEDIA_BASE_URL ?? env.PUBLIC_BASE_URL,
        }),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
