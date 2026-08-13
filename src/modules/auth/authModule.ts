import { Module } from '@nestjs/common'
import { AuthController } from './authController.ts'
import { AuthRepository } from './authRepository.ts'
import { AuthService } from './authService.ts'
import { httpOauthVerifier, OAUTH_VERIFIER } from './oauthVerifier.ts'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    { provide: OAUTH_VERIFIER, useValue: httpOauthVerifier },
  ],
})
export class AuthModule {}
