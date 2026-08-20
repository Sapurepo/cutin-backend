import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { sql } from 'drizzle-orm'
import { createZodDto, ZodResponse } from 'nestjs-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import { Public } from '../../shared/auth/authGuard.ts'

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
})
class HealthResponseDto extends createZodDto(healthResponseSchema) {}

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get('/health')
  @ApiOperation({ summary: '서비스 상태 확인' })
  @ZodResponse({ status: 200, type: HealthResponseDto })
  async health() {
    await this.db.execute(sql`select 1`)
    return { status: 'ok', database: 'up' } as const
  }
}
