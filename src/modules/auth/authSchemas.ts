import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { oauthProviders } from '../../db/schema/index.ts'

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

export const oauthProviderSchema = z.enum(oauthProviders)

export class OauthLoginBodyDto extends createZodDto(oauthLoginBodySchema) {}
export class RefreshBodyDto extends createZodDto(refreshBodySchema) {}
export class TokensResponseDto extends createZodDto(tokensResponseSchema) {}
export class LoginResponseDto extends createZodDto(loginResponseSchema) {}
