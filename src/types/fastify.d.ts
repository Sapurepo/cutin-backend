import type { Database } from '../db/client.ts'
import type { OauthVerifier } from '../modules/auth/oauthVerifier.ts'
import type { StorageService } from '../shared/storage/storageService.ts'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    oauthVerifier: OauthVerifier
    storage: StorageService
  }

  interface FastifyRequest {
    /** `requireAuth` 훅이 채운다. 훅 없이 접근하면 undefined. */
    userId?: string
  }
}
