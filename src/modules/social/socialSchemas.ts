import { z } from 'zod'
import { cursorQuerySchema, pageSchema } from '../../shared/pagination/paginationSchemas.ts'

export const userIdParamsSchema = z.object({ id: z.uuid() })

export const publicUserSchema = z.object({
  id: z.uuid(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})

export const userPageSchema = pageSchema(publicUserSchema)

export const followResultSchema = z.object({
  following: z.boolean(),
  /** 상대도 나를 팔로우해 친구(맞팔)가 되었는지 */
  friend: z.boolean(),
})

export const searchQuerySchema = cursorQuerySchema.extend({
  q: z.string().min(1).max(16),
})

export const recommendQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const recommendedUsersSchema = z.object({
  items: z.array(
    publicUserSchema.extend({
      mutualFriendCount: z.number().int().min(0),
    }),
  ),
})

export const publicProfileSchema = publicUserSchema.extend({
  friendCount: z.number().int().min(0),
  following: z.boolean(),
  followedBy: z.boolean(),
  friend: z.boolean(),
  /** 내가 이 사용자를 차단한 상태인지. 상대가 나를 차단한 경우에는 404가 나간다. */
  blocking: z.boolean(),
})
