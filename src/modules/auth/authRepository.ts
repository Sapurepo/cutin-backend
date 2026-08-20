import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import {
  type Identity,
  identities,
  type OauthProvider,
  type RefreshToken,
  refreshTokens,
  type User,
  users,
} from '../../db/schema/index.ts'

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findIdentity(provider: OauthProvider, providerUserId: string): Promise<Identity | undefined> {
    return this.db.query.identities.findFirst({
      where: and(eq(identities.provider, provider), eq(identities.providerUserId, providerUserId)),
    })
  }

  /** 이메일 기준 자동 연결용. 탈퇴하지 않은 사용자에 붙은 identity만 본다. */
  async findUserIdByEmail(email: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ userId: identities.userId })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .where(and(eq(identities.email, email), isNull(users.deletedAt)))
      .limit(1)
    return row?.userId
  }

  findUserById(userId: string): Promise<User | undefined> {
    return this.db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
    })
  }

  /** 신규 사용자 생성과 identity 연결은 한 트랜잭션에서 처리한다. */
  createUserWithIdentity(input: {
    provider: OauthProvider
    providerUserId: string
    email: string | null
  }): Promise<User> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({}).returning()
      if (user === undefined) throw new Error('사용자 생성에 실패했습니다.')
      await tx.insert(identities).values({ userId: user.id, ...input })
      return user
    })
  }

  async linkIdentity(
    userId: string,
    input: { provider: OauthProvider; providerUserId: string; email: string | null },
  ): Promise<void> {
    await this.db.insert(identities).values({ userId, ...input })
  }

  async insertRefreshToken(input: {
    userId: string
    familyId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<void> {
    await this.db.insert(refreshTokens).values(input)
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | undefined> {
    return this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, tokenHash) })
  }

  async revokeToken(id: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id))
  }

  /** 재사용이 감지되면 해당 로그인 세션에서 파생된 토큰을 전부 폐기한다. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
  }
}
