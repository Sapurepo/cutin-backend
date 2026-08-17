import { Controller, Delete, HttpCode, Param, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import { postIdSchema } from '../posts/postsSchemas.ts'
import { BookmarkResultDto } from './bookmarksSchemas.ts'
import { BookmarksService } from './bookmarksService.ts'

@ApiTags('bookmarks')
@ApiBearerAuth('bearerAuth')
@Controller('posts/:id/bookmark')
export class BookmarksController {
  constructor(private readonly service: BookmarksService) {}

  @Put()
  @ApiOperation({
    summary: '보관',
    description:
      '토글이 아니라 상태 지정이다. 두 번 눌러도 같은 결과이고 보관 목록에 한 번만 남는다.',
  })
  @ZodResponse({ status: 200, type: BookmarkResultDto })
  @ApiErrors(401, 404)
  add(@CurrentUser() userId: string, @Param('id', new ZodParam(postIdSchema)) postId: string) {
    return this.service.add(userId, postId)
  }

  @Delete()
  @ApiOperation({ summary: '보관 해제', description: '보관돼 있지 않아도 200이다.' })
  @ZodResponse({ status: 200, type: BookmarkResultDto })
  @HttpCode(200)
  @ApiErrors(401, 404)
  remove(@CurrentUser() userId: string, @Param('id', new ZodParam(postIdSchema)) postId: string) {
    return this.service.remove(userId, postId)
  }
}
