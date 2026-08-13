import { Module } from '@nestjs/common'
import { DevicesController } from './devicesController.ts'
import { DevicesRepository } from './devicesRepository.ts'
import { DevicesService } from './devicesService.ts'

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DevicesRepository],
  // 알림 발송(즉시·리마인더)이 대상 토큰을 여기서 얻는다.
  exports: [DevicesRepository],
})
export class DevicesModule {}
