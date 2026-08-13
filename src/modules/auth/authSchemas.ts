import { z } from 'zod'
import { oauthProviders } from '../../db/schema/index.ts'

export const oauthLoginParamsSchema = z.object({
  provider: z.enum(oauthProviders),
})

export const oauthLoginBodySchema = z.object({
  /** 구글은 id_token, 카카오는 access_token */
  token: z.string().min(1),
})

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export const tokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
})

export const loginResponseSchema = tokensResponseSchema.extend({
  onboardingCompleted: z.boolean(),
})
