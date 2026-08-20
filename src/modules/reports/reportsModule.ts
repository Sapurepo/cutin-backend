import { Module } from '@nestjs/common'
import { ReportsController } from './reportsController.ts'
import { ReportsRepository } from './reportsRepository.ts'
import { ReportsService } from './reportsService.ts'

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
