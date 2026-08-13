import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notificationsModule.ts'
import { SocialController } from './socialController.ts'
import { SocialRepository } from './socialRepository.ts'
import { SocialService } from './socialService.ts'

@Module({
  // 팔로우가 알림을 남긴다.
  imports: [NotificationsModule],
  controllers: [SocialController],
  providers: [SocialService, SocialRepository],
  exports: [SocialRepository],
})
export class SocialModule {}
