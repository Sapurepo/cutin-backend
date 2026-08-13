import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { CursorQueryDto } from '../../shared/pagination/paginationSchemas.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import {
  FollowResultDto,
  PublicProfileDto,
  RecommendedUsersDto,
  RecommendQueryDto,
  SearchQueryDto,
  UserPageDto,
  userIdSchema,
} from './socialSchemas.ts'
import { SocialService } from './socialService.ts'

/**
 * `:id`를 마지막에 선언한다. Nest는 선언 순서대로 매칭하므로
 * `/users/search`·`/users/recommended`·`/users/me/...`가 먼저 와야 한다.
 */
@ApiTags('social')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class SocialController {
  constructor(private readonly service: SocialService) {}

  @Get('me/followers')
  @ApiOperation({ summary: '나를 팔로우하는 사용자' })
  @ZodResponse({ status: 200, type: UserPageDto })
  listFollowers(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFollowers(userId, query)
  }

  @Get('me/followees')
  @ApiOperation({ summary: '내가 팔로우하는 사용자' })
  @ZodResponse({ status: 200, type: UserPageDto })
  listFollowees(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFollowees(userId, query)
  }

  @Get('me/friends')
  @ApiOperation({ summary: '친구 목록', description: '맞팔이 성립한 사용자만 나온다.' })
  @ZodResponse({ status: 200, type: UserPageDto })
  listFriends(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFriends(userId, query)
  }

  @Get('search')
  @ApiOperation({ summary: '닉네임 검색' })
  @ZodResponse({ status: 200, type: UserPageDto })
  search(@CurrentUser() userId: string, @Query() query: SearchQueryDto) {
    const { q, ...page } = query
    return this.service.search(userId, q, page)
  }

  @Get('recommended')
  @ApiOperation({
    summary: '추천 친구',
    description: '공통 친구가 많은 순으로 채우고, 모자라면 최근 가입자로 메운다.',
  })
  @ZodResponse({ status: 200, type: RecommendedUsersDto })
  recommend(@CurrentUser() userId: string, @Query() query: RecommendQueryDto) {
    return this.service.recommend(userId, query.limit)
  }

  @Post(':id/follow')
  @ApiOperation({
    summary: '팔로우',
    description: '상대도 나를 팔로우 중이면 친구(맞팔)가 되어 friend가 true로 돌아온다.',
  })
  @ZodResponse({ status: 200, type: FollowResultDto })
  @HttpCode(200)
  follow(@CurrentUser() userId: string, @Param('id', new ZodParam(userIdSchema)) id: string) {
    return this.service.follow(userId, id)
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: '언팔로우' })
  @HttpCode(204)
  async unfollow(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
  ): Promise<void> {
    await this.service.unfollow(userId, id)
  }

  @Post(':id/block')
  @ApiOperation({ summary: '차단', description: '차단 즉시 양방향 팔로우와 친구 관계가 끊긴다.' })
  @HttpCode(204)
  async block(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
  ): Promise<void> {
    await this.service.block(userId, id)
  }

  @Delete(':id/block')
  @ApiOperation({
    summary: '차단 해제',
    description: '차단을 풀어도 끊어진 팔로우는 복구되지 않는다.',
  })
  @HttpCode(204)
  async unblock(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
  ): Promise<void> {
    await this.service.unblock(userId, id)
  }

  @Get(':id')
  @ApiOperation({ summary: '타인 프로필' })
  @ZodResponse({ status: 200, type: PublicProfileDto })
  getProfile(@CurrentUser() userId: string, @Param('id', new ZodParam(userIdSchema)) id: string) {
    return this.service.getProfile(userId, id)
  }
}
