import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { createFixtures, type TestUser, truncateAll } from './helpers/fixtures.ts'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

const { createUser, makeFriends, publishPost } = createFixtures(() => context)

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

beforeEach(async () => {
  await context.database.db.execute(sql.raw(truncateAll))
})

function bookmark(user: TestUser, postId: string) {
  return context.app.inject({
    method: 'PUT',
    url: `/posts/${postId}/bookmark`,
    headers: user.headers,
  })
}

function unbookmark(user: TestUser, postId: string) {
  return context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}/bookmark`,
    headers: user.headers,
  })
}

async function bookmarkedIds(user: TestUser): Promise<string[]> {
  const response = await context.app.inject({
    method: 'GET',
    url: '/users/me/bookmarks',
    headers: user.headers,
  })
  expect(response.statusCode).toBe(200)
  return (response.json() as { items: { id: string }[] }).items.map((item) => item.id)
}

async function getPost(user: TestUser, postId: string) {
  const response = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: user.headers,
  })
  expect(response.statusCode).toBe(200)
  return response.json() as { bookmarked: boolean }
}

test('보관은 멱등이다 — 두 번 눌러도 목록에 한 번만 남는다', async () => {
  const alice = await createUser('alice')
  const postId = await publishPost(alice, 'public')

  const first = await bookmark(alice, postId)
  expect(first.statusCode).toBe(200)
  expect(first.json()).toEqual({ bookmarked: true })

  const again = await bookmark(alice, postId)
  expect(again.json()).toEqual({ bookmarked: true })

  expect(await bookmarkedIds(alice)).toEqual([postId])
})

test('보관 해제는 보관돼 있지 않아도 성공한다', async () => {
  const alice = await createUser('alice')
  const postId = await publishPost(alice, 'public')

  const never = await unbookmark(alice, postId)
  expect(never.statusCode).toBe(200)
  expect(never.json()).toEqual({ bookmarked: false })

  await bookmark(alice, postId)
  await unbookmark(alice, postId)
  expect(await bookmarkedIds(alice)).toEqual([])
})

test('볼 수 없는 포스트는 보관할 수 없다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const postId = await publishPost(alice, 'friends')

  const response = await bookmark(bob, postId)

  expect(response.statusCode).toBe(404)
  expect(response.json().error.code).toBe('POST_NOT_FOUND')
})

/**
 * 정렬 키가 포스트 작성 시각이 아니라 보관한 시각이라는 것을 보이려면
 * 두 순서가 어긋나야 한다 — 먼저 쓴 글을 나중에 보관한다.
 */
test('보관 목록은 보관한 시각 최신순이다', async () => {
  const alice = await createUser('alice')
  const older = await publishPost(alice, 'public')
  const newer = await publishPost(alice, 'public')

  await bookmark(alice, newer)
  await bookmark(alice, older)

  // 작성 순이면 [newer, older], 보관 순이면 [older, newer]다.
  expect(await bookmarkedIds(alice)).toEqual([older, newer])
})

test('bookmarked는 보는 사람마다 다르다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')

  await bookmark(bob, postId)

  expect((await getPost(bob, postId)).bookmarked).toBe(true)
  expect((await getPost(alice, postId)).bookmarked).toBe(false)
})

test('포스트를 삭제하면 보관도 정리된다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')
  await bookmark(bob, postId)
  expect(await bookmarkedIds(bob)).toEqual([postId])

  await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })

  expect(await bookmarkedIds(bob)).toEqual([])
})
