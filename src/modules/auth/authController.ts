import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { oauthProviders } from '../../db/schema/index.ts'
import { Public } from '../../shared/auth/authGuard.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import {
  LoginResponseDto,
  OauthLoginBodyDto,
  oauthProviderSchema,
  RefreshBodyDto,
  TokensResponseDto,
} from './authSchemas.ts'
import { AuthService } from './authService.ts'

@ApiTags('auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('oauth/:provider')
  @ApiOperation({
    summary: '소셜 로그인',
    description: 'iOS SDK가 받은 토큰을 서버가 프로바이더에 검증한 뒤 세션 토큰을 발급한다.',
  })
  @ApiParam({ name: 'provider', enum: oauthProviders })
  @ZodResponse({ status: 200, type: LoginResponseDto })
  @HttpCode(200)
  login(
    @Param('provider', new ZodParam(oauthProviderSchema)) provider: 'google' | 'kakao',
    @Body() body: OauthLoginBodyDto,
  ) {
    return this.service.loginWithOauth(provider, body.token)
  }

  @Post('refresh')
  @ApiOperation({ summary: '액세스 토큰 재발급' })
  @ZodResponse({ status: 200, type: TokensResponseDto })
  @HttpCode(200)
  refresh(@Body() body: RefreshBodyDto) {
    return this.service.refresh(body.refreshToken)
  }

  @Post('logout')
  @ApiOperation({ summary: '로그아웃' })
  @HttpCode(204)
  async logout(@Body() body: RefreshBodyDto): Promise<void> {
    await this.service.logout(body.refreshToken)
  }
}
