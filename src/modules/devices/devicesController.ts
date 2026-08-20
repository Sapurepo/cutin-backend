import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { DeviceDto, RegisterDeviceBodyDto, RevokeDeviceBodyDto } from './devicesSchemas.ts'
import { DevicesService } from './devicesService.ts'

@ApiTags('devices')
@ApiBearerAuth('bearerAuth')
@Controller('devices')
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Post()
  @ApiOperation({
    summary: '디바이스 등록',
    description: '앱 실행 시마다 호출한다. 슬롯 리마인더는 여기서 받은 타임존 기준으로 발송한다.',
  })
  @ZodResponse({ status: 201, type: DeviceDto })
  @ApiErrors(400, 401)
  register(@CurrentUser() userId: string, @Body() body: RegisterDeviceBodyDto) {
    return this.service.register(userId, body)
  }

  @Delete()
  @ApiOperation({ summary: '디바이스 해제', description: '로그아웃·알림 해제 시 호출한다.' })
  @HttpCode(204)
  @ApiErrors(400, 401, 404)
  async revoke(@CurrentUser() userId: string, @Body() body: RevokeDeviceBodyDto): Promise<void> {
    await this.service.revoke(userId, body.pushToken)
  }
}
