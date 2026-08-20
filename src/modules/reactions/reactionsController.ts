import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentUser } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import { postIdSchema } from '../posts/postsSchemas.ts'
import { PutReactionBodyDto, ReactionSummaryDto } from './reactionsSchemas.ts'
import { ReactionsService } from './reactionsService.ts'

@ApiTags('reactions')
@ApiBearerAuth('bearerAuth')
@Controller('posts/:id/reaction')
export class ReactionsController {
  constructor(private readonly service: ReactionsService) {}

  @Put()
  @ApiOperation({
    summary: '반응 남기기 · 토글',
    description:
      '사용자당 포스트 1개 반응이다. 같은 종류를 다시 보내면 취소되고, 다른 종류면 교체된다.',
  })
  @ZodResponse({ status: 200, type: ReactionSummaryDto })
  @ApiErrors(400, 401, 404)
  put(
    @CurrentUser() userId: string,
    @Param('id', new ZodParam(postIdSchema)) postId: string,
    @Body() body: PutReactionBodyDto,
  ) {
    return this.service.put(userId, postId, body.type)
  }

  @Delete()
  @ApiOperation({ summary: '반응 취소' })
  @ZodResponse({ status: 200, type: ReactionSummaryDto })
  @HttpCode(200)
  @ApiErrors(401, 404)
  remove(@CurrentUser() userId: string, @Param('id', new ZodParam(postIdSchema)) postId: string) {
    return this.service.remove(userId, postId)
  }
}
