import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { posts } from '../src/db/schema/index.ts'
import { ReminderJob } from '../src/jobs/reminderJob.ts'
import { RetentionJob } from '../src/jobs/retentionJob.ts'
import { createFixtures, type TestUser, truncateAll } from './helpers/fixtures.ts'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

const { createUser, makeFriends, publishPost, firstTemplate } = createFixtures(() => context)

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

beforeEach(async () => {
  await context.database.db.execute(sql.raw(truncateAll))
  context.push.reset()
})

function registerDevice(user: TestUser, timezone: string, pushToken: string) {
  return context.app.inject({
    method: 'POST',
    url: '/devices',
    headers: user.headers,
    payload: { platform: 'ios', pushToken, timezone },
  })
}

function setSlots(user: TestUser, slots: string[], pushEnabled = true) {
  return context.app.inject({
    method: 'PUT',
    url: '/users/me/notification-preferences',
    headers: user.headers,
    payload: { slots, pushEnabled },
  })
}

const reminderJob = () => context.app.get(ReminderJob)
const retentionJob = () => context.app.get(RetentionJob)

test('같은 토큰을 다시 등록하면 새로 만들지 않고 갱신한다', async () => {
  const alice = await createUser('alice')

  const first = await registerDevice(alice, 'Asia/Seoul', 'token-1')
  expect(first.statusCode).toBe(201)
  expect(first.json()).toMatchObject({ platform: 'ios', timezone: 'Asia/Seoul' })

  const again = await registerDevice(alice, 'America/New_York', 'token-1')
  expect(again.statusCode).toBe(201)
  expect(again.json().id).toBe(first.json().id)
  expect(again.json().timezone).toBe('America/New_York')
})

test('올바르지 않은 타임존은 거절한다', async () => {
  const alice = await createUser('alice')

  const response = await context.app.inject({
    method: 'POST',
    url: '/devices',
    headers: alice.headers,
    payload: { platform: 'ios', pushToken: 'token-x', timezone: 'Mars/Olympus' },
  })

  expect(response.statusCode).toBe(400)
  expect(response.json().error.code).toBe('VALIDATION_FAILED')
})

/**
 * 같은 UTC 시각에도 디바이스 타임존에 따라 열리는 슬롯이 다르다.
 * 2026-08-13T23:05Z → 서울은 08:05(아침), 뉴욕은 19:05(해당 슬롯 없음).
 */
test('슬롯 리마인더는 디바이스 타임존 기준으로 발송된다', async () => {
  const seoul = await createUser('seoul')
  const newyork = await createUser('newyork')
  await setSlots(seoul, ['morning', 'evening'])
  await setSlots(newyork, ['morning', 'evening'])
  await registerDevice(seoul, 'Asia/Seoul', 'token-seoul')
  await registerDevice(newyork, 'America/New_York', 'token-newyork')

  const morningInSeoul = await reminderJob().run(new Date('2026-08-13T23:05:00Z'))
  expect(morningInSeoul.sent).toBe(1)
  expect(context.push.sent.map((message) => message.pushToken)).toEqual(['token-seoul'])

  // 한 시간 앞선 시각에는 뉴욕이 저녁 슬롯에 들어간다.
  context.push.reset()
  const eveningInNewYork = await reminderJob().run(new Date('2026-08-13T22:05:00Z'))
  expect(eveningInNewYork.sent).toBe(1)
  expect(context.push.sent.map((message) => message.pushToken)).toEqual(['token-newyork'])
})

test('슬롯 시작 시각을 벗어난 tick에서는 보내지 않는다', async () => {
  const alice = await createUser('alice')
  await setSlots(alice, ['morning'])
  await registerDevice(alice, 'Asia/Seoul', 'token-1')

  // 08:20 — tick 폭(15분)을 벗어나 같은 슬롯이 두 번 열리지 않는다.
  const late = await reminderJob().run(new Date('2026-08-13T23:20:00Z'))

  expect(late.sent).toBe(0)
  expect(context.push.sent).toEqual([])
})

test('고르지 않은 슬롯과 푸시를 끈 사용자는 제외된다', async () => {
  const picky = await createUser('picky')
  const muted = await createUser('muted')
  await setSlots(picky, ['evening'])
  await setSlots(muted, ['morning'], false)
  await registerDevice(picky, 'Asia/Seoul', 'token-picky')
  await registerDevice(muted, 'Asia/Seoul', 'token-muted')

  const result = await reminderJob().run(new Date('2026-08-13T23:05:00Z'))

  expect(result.sent).toBe(0)
})

test('해제한 디바이스에는 보내지 않는다', async () => {
  const alice = await createUser('alice')
  await setSlots(alice, ['morning'])
  await registerDevice(alice, 'Asia/Seoul', 'token-1')

  const revoked = await context.app.inject({
    method: 'DELETE',
    url: '/devices',
    headers: alice.headers,
    payload: { pushToken: 'token-1' },
  })
  expect(revoked.statusCode).toBe(204)

  const result = await reminderJob().run(new Date('2026-08-13T23:05:00Z'))
  expect(result.sent).toBe(0)
})

test('무효 토큰으로 판정되면 디바이스가 폐기된다', async () => {
  const alice = await createUser('alice')
  await setSlots(alice, ['morning'])
  await registerDevice(alice, 'Asia/Seoul', 'token-1')
  context.push.invalidTokens = ['token-1']

  await reminderJob().run(new Date('2026-08-13T23:05:00Z'))

  context.push.reset()
  const second = await reminderJob().run(new Date('2026-08-14T23:05:00Z'))
  expect(second.sent).toBe(0)
})

test('댓글이 달리면 인앱 알림과 함께 즉시 푸시된다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  await registerDevice(alice, 'Asia/Seoul', 'token-alice')
  const postId = await publishPost(alice, 'friends')
  context.push.reset()

  await context.app.inject({
    method: 'POST',
    url: `/posts/${postId}/comments`,
    headers: bob.headers,
    payload: { body: '좋다' },
  })

  expect(context.push.sent).toHaveLength(1)
  expect(context.push.sent[0]).toMatchObject({
    pushToken: 'token-alice',
    title: 'bob',
    data: { targetType: 'post', targetId: postId },
  })
})

test('본인 행동에는 푸시가 나가지 않는다', async () => {
  const alice = await createUser('alice')
  await registerDevice(alice, 'Asia/Seoul', 'token-alice')
  const postId = await publishPost(alice, 'public')
  context.push.reset()

  await context.app.inject({
    method: 'POST',
    url: `/posts/${postId}/comments`,
    headers: alice.headers,
    payload: { body: '내 글에 내가' },
  })

  expect(context.push.sent).toEqual([])
})

test('24시간이 지난 draft만 정리하고 발행된 포스트는 건드리지 않는다', async () => {
  const alice = await createUser('alice')
  const publishedId = await publishPost(alice, 'public')
  const template = await firstTemplate(alice)
  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  const draftId = (draft.json() as { id: string }).id

  const now = new Date('2026-08-13T00:00:00Z')
  // 아직 25시간이 지나지 않은 상태
  const early = await retentionJob().expireDrafts(now)
  expect(early.expired).toBe(0)

  // draft를 25시간 전에 만든 것으로 되돌린다.
  await context.database.db
    .update(posts)
    .set({ createdAt: new Date('2026-08-11T23:00:00Z') })
    .where(sql`${posts.id} = ${draftId}::uuid`)

  const expired = await retentionJob().expireDrafts(now)
  expect(expired.expired).toBe(1)

  // 발행된 포스트는 그대로다.
  const stillThere = await context.app.inject({
    method: 'GET',
    url: `/posts/${publishedId}`,
    headers: alice.headers,
  })
  expect(stillThere.statusCode).toBe(200)

  // draft가 비워져 새로 만들 수 있다.
  const fresh = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  expect(fresh.statusCode).toBe(201)
})

test('purge는 보존 기간이 지난 소프트 삭제만 지운다', async () => {
  const alice = await createUser('alice')
  const recentId = await publishPost(alice, 'public')
  await context.app.inject({
    method: 'DELETE',
    url: `/posts/${recentId}`,
    headers: alice.headers,
  })

  const now = new Date('2026-08-13T00:00:00Z')
  const untouched = await retentionJob().purge(now)
  expect(untouched.posts).toBe(0)

  // 1년 하고도 하루 전에 지워진 것으로 되돌린다.
  await context.database.db
    .update(posts)
    .set({ deletedAt: new Date('2025-08-11T00:00:00Z') })
    .where(sql`${posts.id} = ${recentId}::uuid`)

  const purged = await retentionJob().purge(now)
  expect(purged.posts).toBe(1)
})
