import { Controller, Get, Param, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { Public } from '../../shared/auth/authGuard.ts'
import { renderMissingPage, renderSharePage } from './sharePage.ts'
import { ShareService } from './shareService.ts'

const postIdSchema = z.uuid()

/**
 * 공유 링크와 QR이 여는 웹 페이지. `GET /posts/{id}/share`가 주는 주소가 여기다 —
 * 이 라우트가 없던 동안 공유 링크는 열리지 않는 주소였다.
 *
 * JSON API가 아니라 HTML이라 스펙에서 뺀다. 생성된 클라이언트가 이 경로를 호출할 일은 없다.
 */
@ApiExcludeController()
@Controller()
export class ShareController {
  constructor(private readonly service: ShareService) {}

  @Public()
  @Get('p/:id')
  async page(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const parsed = postIdSchema.safeParse(id.toLowerCase())
    const post = parsed.success ? await this.service.findSharedPost(parsed.data) : undefined

    if (post === undefined) {
      await reply.code(404).type('text/html; charset=utf-8').send(renderMissingPage())
      return
    }

    await reply
      .type('text/html; charset=utf-8')
      // 캡션·공개 범위가 바뀌면 페이지도 바뀐다. 카카오톡 미리보기가 옛것을 오래 물지 않게 짧게 둔다.
      .header('cache-control', 'public, max-age=300')
      .send(renderSharePage(post))
  }
}
