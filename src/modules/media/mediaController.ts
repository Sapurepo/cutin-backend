import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodResponse } from 'nestjs-zod'
import { z } from 'zod'
import { CurrentUser, Public } from '../../shared/auth/authGuard.ts'
import { ApiErrors } from '../../shared/errors/apiErrors.ts'
import { ZodParam } from '../../shared/validation/zodParam.ts'
import {
  allowedMimes,
  CompleteUploadBodyDto,
  CreateUploadBodyDto,
  MediaDto,
  UploadTargetDto,
} from './mediaSchemas.ts'
import { MediaService } from './mediaService.ts'

const uuidSchema = z.uuid()

/**
 * Fastify는 `/media/content/*`로 받지만 스펙에는 `{path}`로 나간다.
 * 명시하지 않으면 생성된 클라이언트가 채울 인자가 없어 호출 자체를 못 한다.
 */
const storageKeyParam = ApiParam({
  name: 'path',
  description: '`POST /media/uploads`가 준 URL의 `/media/content/` 뒤 전체 경로',
  example: 'cut/8b1a.../3f2c....png',
})

/** Fastify 와일드카드(`*`)로 잡힌 저장 키. Nest의 @Param으로는 꺼낼 수 없다. */
function storageKeyOf(request: FastifyRequest): string {
  return (request.params as Record<string, string>)['*'] ?? ''
}

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Post('uploads')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: '업로드 목적지 발급',
    description:
      '미디어를 pending으로 만들고 바이트를 보낼 곳을 알려준다. 업로드 후 complete를 호출해야 포스트에 붙일 수 있다.',
  })
  @ZodResponse({ status: 201, type: UploadTargetDto })
  @ApiErrors(400, 401)
  createUpload(@CurrentUser() userId: string, @Body() body: CreateUploadBodyDto) {
    return this.service.createUpload(userId, body)
  }

  @Put('content/*')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: '이미지 업로드',
    description: '`POST /media/uploads`가 준 URL로 이미지 바이트를 그대로 PUT한다.',
  })
  @storageKeyParam
  @ApiConsumes(...allowedMimes)
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @HttpCode(204)
  @ApiErrors(401, 404, 413)
  async putContent(
    @Req() request: FastifyRequest,
    @CurrentUser() userId: string,
    @Body() body: Buffer,
  ): Promise<void> {
    await this.service.putContent(storageKeyOf(request), userId, body)
  }

  @Public()
  @Get('content/*')
  @ApiOperation({
    summary: '이미지 조회',
    description:
      '키에 소유자·미디어 id가 들어가 추측할 수 없으므로 인증을 요구하지 않는다. 응답은 JSON이 아니라 이미지 바이트다.',
  })
  @storageKeyParam
  @ApiProduces(...allowedMimes)
  @ApiResponse({
    status: 200,
    description: '이미지 바이트',
    content: Object.fromEntries(
      allowedMimes.map((mime) => [mime, { schema: { type: 'string', format: 'binary' } }]),
    ),
  })
  @ApiErrors(404)
  async readContent(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const { body, mime } = await this.service.readContent(storageKeyOf(request))
    await reply.header('content-type', mime).send(body)
  }

  @Post(':id/complete')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: '업로드 완료 처리' })
  @ZodResponse({ status: 200, type: MediaDto })
  @HttpCode(200)
  @ApiErrors(400, 401, 404)
  complete(
    @Param('id', new ZodParam(uuidSchema)) id: string,
    @CurrentUser() userId: string,
    @Body() body: CompleteUploadBodyDto,
  ) {
    return this.service.complete(id, userId, body)
  }
}
