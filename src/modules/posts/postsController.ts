import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser, Public } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { CursorQueryDto } from '../../shared/pagination/paginationSchemas.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import { userIdSchema } from '../social/socialSchemas.ts'
import {
  CreatePostBodyDto,
  FramesResponseDto,
  PostDto,
  PostPageDto,
  PublishPostBodyDto,
  postIdSchema,
  ShareLinkDto,
  TemplatesResponseDto,
  UpdatePostBodyDto,
} from './postsSchemas.ts'
import { PostsService } from './postsService.ts'

@ApiTags('posts')
@ApiBearerAuth('bearerAuth')
@Controller()
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Get('templates')
  @ApiOperation({
    summary: '템플릿 목록',
    description: '컷 수와 레이아웃은 서버가 정의한다. 클라이언트가 컷 수를 가정하지 않는다.',
  })
  @ZodResponse({ status: 200, type: TemplatesResponseDto })
  @ApiErrors(401)
  listTemplates() {
    return this.service.listTemplates()
  }

  @Public()
  @Get('frames/assets/:name')
  @ApiOperation({
    summary: '프레임 장식 그림',
    description:
      '프레임 목록이 주는 장식 URL이 가리키는 곳이다. 모두에게 같은 자산이라 인증을 요구하지 않는다.',
  })
  @ApiProduces('image/png')
  @ApiResponse({
    status: 200,
    description: 'PNG 바이트',
    content: { 'image/png': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrors(404)
  async readFrameAsset(@Param('name') name: string, @Res() reply: FastifyReply): Promise<void> {
    const body = await this.service.readFrameAsset(name)
    await reply
      .header('content-type', 'image/png')
      // 그림을 고치면 파일 이름을 바꾸는 것이 규칙이라 하루는 안전하다.
      .header('cache-control', 'public, max-age=86400')
      .send(body)
  }

  @Get('frames')
  @ApiOperation({
    summary: '프레임(외형) 목록',
    description:
      '컷 그리드를 감싸는 외형이다. 길이 값은 캔버스 폭 대비 비율이라 출력 해상도와 무관하다. ' +
      '노출 순서대로 내려가며 첫 항목이 기본 외형이다 — 포스트의 frame이 null일 때 이 값으로 그린다.',
  })
  @ZodResponse({ status: 200, type: FramesResponseDto })
  @ApiErrors(401)
  listFrames() {
    return this.service.listFrames()
  }

  @Post('posts')
  @ApiOperation({
    summary: 'draft 생성',
    description: 'draft는 사용자당 1개다. 이미 있으면 409가 나간다.',
  })
  @ZodResponse({ status: 201, type: PostDto })
  @ApiErrors(400, 401, 409)
  createDraft(@CurrentUser() userId: string, @Body() body: CreatePostBodyDto) {
    return this.service.createDraft(userId, body.templateId)
  }

  @Get('posts/draft')
  @ApiOperation({
    summary: '작성 중인 draft 조회',
    description: '촬영 진입 시 이어쓰기 여부를 정하기 위해 부른다.',
  })
  @ZodResponse({ status: 200, type: PostDto })
  @ApiErrors(401, 404)
  getDraft(@CurrentUser() userId: string) {
    return this.service.getDraft(userId)
  }

  @Get('feed')
  @ApiOperation({
    summary: '피드',
    description: '내 글 + 전체공개 + 친구공개(맞팔)를 최신순으로 준다.',
  })
  @ZodResponse({ status: 200, type: PostPageDto })
  @ApiErrors(400, 401)
  feed(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.feed(userId, query)
  }

  @Get('users/:id/posts')
  @ApiOperation({
    summary: '사용자 포스트 목록',
    description:
      '본인 id를 넣으면 기록 보관함이 된다. 노출 범위는 피드와 같은 규칙이다. 고정(pinned)한 포스트가 맨 앞에 오고 그 안에서 발행 시각 역순이다.',
  })
  @ZodResponse({ status: 200, type: PostPageDto })
  @ApiErrors(400, 401)
  listByAuthor(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(userIdSchema)) id: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.service.listByAuthor(userId, id, query)
  }

  @Get('users/me/bookmarks')
  @ApiOperation({
    summary: '보관 목록',
    description: '보관한 시각 최신순이다. 포스트 작성 순이 아니다.',
  })
  @ZodResponse({ status: 200, type: PostPageDto })
  @ApiErrors(400, 401)
  listBookmarked(@CurrentUser() userId: string, @Query() query: CursorQueryDto) {
    return this.service.listBookmarked(userId, query)
  }

  @Get('posts/:id/share')
  @ApiOperation({ summary: '공유 링크', description: '비공개 포스트는 공유할 수 없다.' })
  @ZodResponse({ status: 200, type: ShareLinkDto })
  @ApiErrors(401, 403, 404)
  getShareLink(@CurrentUser() userId: string, @Param('id', new ZodParam(postIdSchema)) id: string) {
    return this.service.getShareLink(userId, id)
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '포스트 상세' })
  @ZodResponse({ status: 200, type: PostDto })
  @ApiErrors(401, 404)
  getPost(@CurrentUser() userId: string, @Param('id', new ZodParam(postIdSchema)) id: string) {
    return this.service.getPost(userId, id)
  }

  @Patch('posts/:id')
  @ApiOperation({
    summary: 'draft 편집 · 발행본은 대표 컷·고정·공개 범위만',
    description:
      'cuts를 보내면 기존 컷을 전부 대체한다. 발행된 포스트는 thumbnailCutIndex(0 = 기본 첫 컷)와 pinned(프로필 맨 앞 고정), visibility(공개 범위)만 바꿀 수 있다 — 다른 필드가 섞이면 POST_NOT_DRAFT.',
  })
  @ZodResponse({ status: 200, type: PostDto })
  @ApiErrors(400, 401, 404)
  updateDraft(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) id: string,
    @Body() body: UpdatePostBodyDto,
  ) {
    return this.service.updateDraft(id, userId, body)
  }

  @Post('posts/:id/publish')
  @ApiOperation({
    summary: '발행',
    description: '컷이 템플릿 수만큼 채워지고 합성본 업로드가 끝나야 발행된다.',
  })
  @ZodResponse({ status: 200, type: PostDto })
  @HttpCode(200)
  @ApiErrors(400, 401, 404)
  publish(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) id: string,
    @Body() body: PublishPostBodyDto,
  ) {
    return this.service.publish(id, userId, body)
  }

  @Delete('posts/:id')
  @ApiOperation({
    summary: '포스트 삭제 · draft 폐기',
    description: '소프트 삭제한다. draft를 지우면 새 draft를 만들 수 있다.',
  })
  @HttpCode(204)
  @ApiErrors(401, 404)
  async remove(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) id: string,
  ): Promise<void> {
    await this.service.remove(id, userId)
  }
}
