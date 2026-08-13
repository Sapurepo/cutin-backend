import { afterAll, beforeAll, expect, test } from 'vitest'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

test('GET /health는 DB 연결까지 확인한다', async () => {
  const response = await context.app.inject({ method: 'GET', url: '/health' })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ status: 'ok', database: 'up' })
})

test('없는 경로는 통일된 오류 형태로 404를 반환한다', async () => {
  const response = await context.app.inject({ method: 'GET', url: '/nope' })

  expect(response.statusCode).toBe(404)
  expect(response.json()).toEqual({
    error: { code: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' },
  })
})

test('OpenAPI 스펙에 라우트가 등록된다', () => {
  const spec = context.app.swagger() as { paths: Record<string, unknown> }

  expect(spec.paths['/health']).toBeDefined()
})
