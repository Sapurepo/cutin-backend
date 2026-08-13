import { Body, Controller, Get, HttpCode, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import {
  NicknameAvailabilityQueryDto,
  NicknameAvailabilityResponseDto,
  NotificationPreferencesBodyDto,
  NotificationPreferencesResponseDto,
  UpdateMeBodyDto,
  UserProfileDto,
} from './usersSchemas.ts'
import { UsersService } from './usersService.ts'

@ApiTags('users')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '내 프로필' })
  @ZodResponse({ status: 200, type: UserProfileDto })
  getMe(@CurrentUser() userId: string) {
    return this.service.getMe(userId)
  }

  @Get('nickname/availability')
  @ApiOperation({ summary: '닉네임 사용 가능 여부' })
  @ZodResponse({ status: 200, type: NicknameAvailabilityResponseDto })
  checkNickname(@Query() query: NicknameAvailabilityQueryDto) {
    return this.service.checkNicknameAvailability(query.nickname)
  }

  @Patch('me')
  @ApiOperation({ summary: '내 프로필 수정' })
  @ZodResponse({ status: 200, type: UserProfileDto })
  updateMe(@CurrentUser() userId: string, @Body() body: UpdateMeBodyDto) {
    return this.service.updateMe(userId, body)
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: '알림 선호 시간대 조회' })
  @ZodResponse({ status: 200, type: NotificationPreferencesResponseDto })
  getPreferences(@CurrentUser() userId: string) {
    return this.service.getPreferences(userId)
  }

  @Put('me/notification-preferences')
  @ApiOperation({
    summary: '알림 선호 시간대 설정',
    description: '4개 슬롯 중 다중 선택. 리마인더성 푸시만 이 슬롯에 예약된다.',
  })
  @ZodResponse({ status: 200, type: NotificationPreferencesResponseDto })
  updatePreferences(@CurrentUser() userId: string, @Body() body: NotificationPreferencesBodyDto) {
    return this.service.updatePreferences(userId, body)
  }

  @Post('me/onboarding/complete')
  @ApiOperation({ summary: '온보딩 완료' })
  @ZodResponse({ status: 200, type: UserProfileDto })
  @HttpCode(200)
  completeOnboarding(@CurrentUser() userId: string) {
    return this.service.completeOnboarding(userId)
  }
}
