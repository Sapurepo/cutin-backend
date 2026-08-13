import { Module } from '@nestjs/common'
import { NotificationsController } from './notificationsController.ts'
import { NotificationsRepository } from './notificationsRepository.ts'
import { NotificationsService } from './notificationsService.ts'

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  // social·comments·reactions가 상호작용 시점에 알림을 남긴다.
  exports: [NotificationsRepository],
})
export class NotificationsModule {}
