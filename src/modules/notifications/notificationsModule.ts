import { Module } from '@nestjs/common'
import { DevicesModule } from '../devices/devicesModule.ts'
import { NotificationsController } from './notificationsController.ts'
import { NotificationsRepository } from './notificationsRepository.ts'
import { NotificationsService } from './notificationsService.ts'

@Module({
  // 즉시 푸시 대상 토큰을 여기서 얻는다.
  imports: [DevicesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  // social·comments·reactions가 상호작용 시점에 알림을 남기고 푸시한다.
  exports: [NotificationsService],
})
export class NotificationsModule {}
