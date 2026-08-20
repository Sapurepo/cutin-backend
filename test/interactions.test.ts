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

function comment(user: TestUser, postId: string, body: string) {
  return context.app.inject({
    method: 'POST',
    url: `/posts/${postId}/comments`,
    headers: user.headers,
    payload: { body },
  })
}

function react(user: TestUser, postId: string, type: string) {
  return context.app.inject({
    method: 'PUT',
    url: `/posts/${postId}/reaction`,
    headers: user.headers,
    payload: { type },
  })
}

async function getPost(user: TestUser, postId: string) {
  const response = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: user.headers,
  })
  expect(response.statusCode).toBe(200)
  return response.json() as {
    commentCount: number
    reactions: { total: number; counts: { type: string; count: number }[]; mine: string | null }
  }
}

async function notifications(user: TestUser) {
  const response = await context.app.inject({
    method: 'GET',
    url: '/notifications',
    headers: user.headers,
  })
  expect(response.statusCode).toBe(200)
  return (response.json() as { items: { type: string; actor: { nickname: string } }[] }).items
}

test('댓글은 작성 순으로 쌓이고 카운트에 반영된다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')

  const created = await comment(bob, postId, '좋다')
  expect(created.statusCode).toBe(201)
  expect(created.json()).toMatchObject({ body: '좋다', author: { nickname: 'bob' } })
  await comment(alice, postId, '고마워')

  const list = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}/comments`,
    headers: alice.headers,
  })
  const bodies = (list.json() as { items: { body: string }[] }).items.map((item) => item.body)
  expect(bodies).toEqual(['좋다', '고마워'])
  expect((await getPost(alice, postId)).commentCount).toBe(2)
})

test('댓글은 작성자와 포스트 주인만 지울 수 있다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const carol = await createUser('carol')
  await makeFriends(alice, bob)
  await makeFriends(alice, carol)
  const postId = await publishPost(alice, 'friends')

  const created = await comment(bob, postId, '좋다')
  const commentId = (created.json() as { id: string }).id

  const byStranger = await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}/comments/${commentId}`,
    headers: carol.headers,
  })
  expect(byStranger.statusCode).toBe(403)

  // 포스트 주인은 지울 수 있다.
  const byPostAuthor = await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}/comments/${commentId}`,
    headers: alice.headers,
  })
  expect(byPostAuthor.statusCode).toBe(204)
  expect((await getPost(alice, postId)).commentCount).toBe(0)
})

test('볼 수 없는 포스트에는 댓글을 달 수 없다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const postId = await publishPost(alice, 'friends')

  const response = await comment(bob, postId, '안녕')

  expect(response.statusCode).toBe(404)
  expect(response.json().error.code).toBe('POST_NOT_FOUND')
})

test('반응은 사용자당 하나이고 같은 종류를 다시 누르면 취소된다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')

  const liked = await react(bob, postId, 'like')
  expect(liked.json()).toEqual({ total: 1, counts: [{ type: 'like', count: 1 }], mine: 'like' })

  // 다른 종류를 누르면 교체된다. 합계는 그대로 1이다.
  const replaced = await react(bob, postId, 'love')
  expect(replaced.json()).toEqual({ total: 1, counts: [{ type: 'love', count: 1 }], mine: 'love' })

  // 같은 종류를 다시 누르면 취소된다.
  const toggledOff = await react(bob, postId, 'love')
  expect(toggledOff.json()).toEqual({ total: 0, counts: [], mine: null })

  // 본인 반응 표시는 보는 사람마다 다르다.
  await react(bob, postId, 'like')
  expect((await getPost(bob, postId)).reactions.mine).toBe('like')
  expect((await getPost(alice, postId)).reactions.mine).toBeNull()
  expect((await getPost(alice, postId)).reactions.total).toBe(1)
})

test('반응 취소 요청은 없던 반응에도 안전하다', async () => {
  const alice = await createUser('alice')
  const postId = await publishPost(alice, 'public')

  const response = await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}/reaction`,
    headers: alice.headers,
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ total: 0, counts: [], mine: null })
})

test('댓글·반응·팔로우가 알림으로 남고 본인 행동은 남지 않는다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')

  await comment(bob, postId, '좋다')
  await react(bob, postId, 'like')
  // 본인 포스트에 스스로 단 댓글은 알림이 되지 않는다.
  await comment(alice, postId, '고마워')

  const items = await notifications(alice)
  expect(items.map((item) => item.type).sort()).toEqual(['comment', 'follow', 'reaction'])
  expect(items.every((item) => item.actor.nickname === 'bob')).toBe(true)

  const unread = await context.app.inject({
    method: 'GET',
    url: '/notifications/unread-count',
    headers: alice.headers,
  })
  expect(unread.json()).toEqual({ count: 3 })

  const read = await context.app.inject({
    method: 'POST',
    url: '/notifications/read',
    headers: alice.headers,
    payload: {},
  })
  expect(read.json()).toEqual({ count: 0 })
})

test('반응을 취소하면 알림도 사라진다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')

  await react(bob, postId, 'like')
  expect((await notifications(alice)).filter((item) => item.type === 'reaction')).toHaveLength(1)

  // 종류를 바꿔도 알림은 한 줄만 남는다.
  await react(bob, postId, 'love')
  expect((await notifications(alice)).filter((item) => item.type === 'reaction')).toHaveLength(1)

  await react(bob, postId, 'love')
  expect((await notifications(alice)).filter((item) => item.type === 'reaction')).toHaveLength(0)
})

test('비공개 포스트는 공유 링크를 만들지 않는다', async () => {
  const alice = await createUser('alice')

  const publicPostId = await publishPost(alice, 'public')
  const shared = await context.app.inject({
    method: 'GET',
    url: `/posts/${publicPostId}/share`,
    headers: alice.headers,
  })
  expect(shared.statusCode).toBe(200)
  expect((shared.json() as { url: string }).url).toContain(publicPostId)

  await context.app.inject({
    method: 'DELETE',
    url: `/posts/${publicPostId}`,
    headers: alice.headers,
  })
  const privatePostId = await publishPost(alice, 'private')
  const blocked = await context.app.inject({
    method: 'GET',
    url: `/posts/${privatePostId}/share`,
    headers: alice.headers,
  })
  expect(blocked.statusCode).toBe(403)
  expect(blocked.json().error.code).toBe('POST_NOT_SHAREABLE')
})

test('신고는 대상을 확인하고 접수하되 중복은 막는다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const postId = await publishPost(alice, 'public')

  const accepted = await context.app.inject({
    method: 'POST',
    url: '/reports',
    headers: bob.headers,
    payload: { targetType: 'post', targetId: postId, reason: 'spam' },
  })
  expect(accepted.statusCode).toBe(201)
  expect(accepted.json()).toMatchObject({ targetType: 'post', reason: 'spam', status: 'pending' })

  const duplicate = await context.app.inject({
    method: 'POST',
    url: '/reports',
    headers: bob.headers,
    payload: { targetType: 'post', targetId: postId, reason: 'abuse' },
  })
  expect(duplicate.statusCode).toBe(409)
  expect(duplicate.json().error.code).toBe('ALREADY_REPORTED')

  const missing = await context.app.inject({
    method: 'POST',
    url: '/reports',
    headers: bob.headers,
    payload: { targetType: 'post', targetId: alice.id, reason: 'spam' },
  })
  expect(missing.statusCode).toBe(404)
  expect(missing.json().error.code).toBe('REPORT_TARGET_NOT_FOUND')

  const selfReport = await context.app.inject({
    method: 'POST',
    url: '/reports',
    headers: bob.headers,
    payload: { targetType: 'user', targetId: bob.id, reason: 'spam' },
  })
  expect(selfReport.statusCode).toBe(400)
})
