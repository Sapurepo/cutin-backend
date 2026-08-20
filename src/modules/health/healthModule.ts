import { Module } from '@nestjs/common'
import { HealthController } from './healthController.ts'

@Module({ controllers: [HealthController] })
export class HealthModule {}
