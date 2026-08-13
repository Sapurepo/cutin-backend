import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import {
  type Media,
  type NotificationPreference,
  type NotificationSlot,
  notificationPreferences,
  type User,
  users,
} from '../../db/schema/index.ts'

export type UserWithAvatar = User & { avatar: Media | null }

export interface UpdatableUserFields {
  nickname?: string
  timezone?: string
  avatarMediaId?: string | null
}

export function createUsersRepository(db: Database) {
  return {
    findById(userId: string): Promise<UserWithAvatar | undefined> {
      return db.query.users.findFirst({
        where: and(eq(users.id, userId), isNull(users.deletedAt)),
        with: { avatar: true },
      })
    },

    async isNicknameTaken(nickname: string): Promise<boolean> {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.nickname}) = lower(${nickname})`, isNull(users.deletedAt)))
        .limit(1)
      return row !== undefined
    },

    async update(userId: string, values: UpdatableUserFields): Promise<boolean> {
      const rows = await db
        .update(users)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id })
      return rows.length > 0
    },

    async completeOnboarding(userId: string): Promise<boolean> {
      const now = new Date()
      const rows = await db
        .update(users)
        .set({ onboardingCompletedAt: now, updatedAt: now })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id })
      return rows.length > 0
    },

    findPreferences(userId: string): Promise<NotificationPreference | undefined> {
      return db.query.notificationPreferences.findFirst({
        where: eq(notificationPreferences.userId, userId),
      })
    },

    async upsertPreferences(
      userId: string,
      values: { slots: NotificationSlot[]; pushEnabled: boolean },
    ): Promise<NotificationPreference> {
      const [row] = await db
        .insert(notificationPreferences)
        .values({ userId, ...values })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { ...values, updatedAt: new Date() },
        })
        .returning()
      if (row === undefined) throw new Error('알림 설정 저장에 실패했습니다.')
      return row
    },
  }
}

export type UsersRepository = ReturnType<typeof createUsersRepository>
