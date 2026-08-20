import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
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
 * `:id`를 마지막에 선언해 읽기 순서를 구체적인 것 → 일반적인 것으로 둔다.
 * 매칭 자체는 순서와 무관하다 — Fastify(find-my-way)가 정적 세그먼트를
 * 파라미터보다 우선하므로 `/users/search`는 `/users/:id`보다 항상 먼저 잡힌다.
 * 다만 Express 어댑터로 바꾸면 순서가 의미를 갖는다.
 */
@ApiTags('social')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class SocialController {
  constructor(private readonly service: SocialService) {}

  @Get('me/followers')
  @ApiOperation({ summary: '나를 팔로우하는 사용자' })
  @ZodResponse({ status: 200, type: UserPageDto })
  @ApiErrors(400, 401)
  listFollowers(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFollowers(userId, query)
  }

  @Get('me/followees')
  @ApiOperation({ summary: '내가 팔로우하는 사용자' })
  @ZodResponse({ status: 200, type: UserPageDto })
  @ApiErrors(400, 401)
  listFollowees(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFollowees(userId, query)
  }

  @Get('me/friends')
  @ApiOperation({ summary: '친구 목록', description: '맞팔이 성립한 사용자만 나온다.' })
  @ZodResponse({ status: 200, type: UserPageDto })
  @ApiErrors(400, 401)
  listFriends(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listFriends(userId, query)
  }

  @Get('search')
  @ApiOperation({ summary: '닉네임 검색' })
  @ZodResponse({ status: 200, type: UserPageDto })
  @ApiErrors(400, 401)
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
  @ApiErrors(401)
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
  @ApiErrors(400, 401, 403, 404)
  follow(@CurrentUser() userId: string, @Param('id', new ZodParam(userIdSchema)) id: string) {
    return this.service.follow(userId, id)
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: '언팔로우' })
  @HttpCode(204)
  @ApiErrors(400, 401, 404)
  async unfollow(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
  ): Promise<void> {
    await this.service.unfollow(userId, id)
  }

  @Post(':id/block')
  @ApiOperation({ summary: '차단', description: '차단 즉시 양방향 팔로우와 친구 관계가 끊긴다.' })
  @HttpCode(204)
  @ApiErrors(400, 401, 404)
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
  @ApiErrors(401)
  async unblock(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
  ): Promise<void> {
    await this.service.unblock(userId, id)
  }

  @Get(':id')
  @ApiOperation({ summary: '타인 프로필' })
  @ZodResponse({ status: 200, type: PublicProfileDto })
  @ApiErrors(400, 401, 404)
  getProfile(@CurrentUser() userId: string, @Param('id', new ZodParam(userIdSchema)) id: string) {
    return this.service.getProfile(userId, id)
  }
}
