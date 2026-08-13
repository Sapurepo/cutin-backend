import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { CursorQueryDto } from '../../shared/pagination/paginationSchemas.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import { postIdSchema } from '../posts/postsSchemas.ts'
import {
  CommentDto,
  CommentPageDto,
  CreateCommentBodyDto,
  commentIdSchema,
} from './commentsSchemas.ts'
import { CommentsService } from './commentsService.ts'

@ApiTags('comments')
@ApiBearerAuth('bearerAuth')
@Controller('posts/:id/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get()
  @ApiOperation({ summary: '댓글 목록', description: '오래된 댓글부터 준다.' })
  @ZodResponse({ status: 200, type: CommentPageDto })
  list(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) postId: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.service.list(userId, postId, query)
  }

  @Post()
  @ApiOperation({ summary: '댓글 작성' })
  @ZodResponse({ status: 201, type: CommentDto })
  create(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) postId: string,
    @Body() body: CreateCommentBodyDto,
  ) {
    return this.service.create(userId, postId, body.body)
  }

  @Delete(':commentId')
  @ApiOperation({
    summary: '댓글 삭제',
    description: '댓글 작성자와 포스트 작성자가 지울 수 있다.',
  })
  @HttpCode(204)
  async remove(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) postId: string,
    @Param('commentId', new ZodParam(commentIdSchema)) commentId: string,
  ): Promise<void> {
    await this.service.remove(userId, postId, commentId)
  }
}
