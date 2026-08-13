import { sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
})

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: '서비스 상태 확인',
        response: { 200: healthResponseSchema },
      },
    },
    async () => {
      await app.db.execute(sql`select 1`)
      return { status: 'ok', database: 'up' } as const
    },
  )
}
