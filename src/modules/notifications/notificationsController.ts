import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { CursorQueryDto } from '../../shared/pagination/paginationSchemas.ts'
import { MarkReadBodyDto, NotificationPageDto, UnreadCountDto } from './notificationsSchemas.ts'
import { NotificationsService } from './notificationsService.ts'

@ApiTags('notifications')
@ApiBearerAuth('bearerAuth')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '인앱 알림 목록' })
  @ZodResponse({ status: 200, type: NotificationPageDto })
  list(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.list(userId, query)
  }

  @Get('unread-count')
  @ApiOperation({ summary: '미읽음 개수', description: '탭 뱃지에 쓴다.' })
  @ZodResponse({ status: 200, type: UnreadCountDto })
  unreadCount(@CurrentUser() userId: string) {
    return this.service.unreadCount(userId)
  }

  @Post('read')
  @ApiOperation({
    summary: '읽음 처리',
    description: '응답의 count는 읽음 처리 후 남은 미읽음 개수다.',
  })
  @ZodResponse({ status: 200, type: UnreadCountDto })
  @HttpCode(200)
  markRead(@CurrentUser() userId: string, @Body() body: MarkReadBodyDto) {
    return this.service.markRead(userId, body.ids)
  }
}
