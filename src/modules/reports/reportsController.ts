import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { CreateReportBodyDto, ReportDto } from './reportsSchemas.ts'
import { ReportsService } from './reportsService.ts'

@ApiTags('reports')
@ApiBearerAuth('bearerAuth')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  @ApiOperation({
    summary: '신고 접수',
    description: '포스트·댓글·사용자를 신고한다. 같은 대상을 두 번 신고하면 409가 나간다.',
  })
  @ZodResponse({ status: 201, type: ReportDto })
  @ApiErrors(400, 401, 404, 409)
  create(@CurrentUser() userId: string, @Body() body: CreateReportBodyDto) {
    return this.service.create(userId, body)
  }
}
