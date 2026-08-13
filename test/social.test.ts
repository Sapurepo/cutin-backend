import { sql } from 'drizzle-orm'
import { decodeJwt } from 'jose'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { truncateAll } from './helpers/fixtures.ts'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

beforeEach(async () => {
  await context.database.db.execute(sql.raw(truncateAll))
})

interface TestUser {
  id: string
  headers: { authorization: string }
}

/** 닉네임까지 설정된 사용자를 만든다. 검색·추천 대상이 되려면 닉네임이 있어야 한다. */
async function createUser(nickname: string): Promise<TestUser> {
  context.oauth.setProfile({
    provider: 'google',
    providerUserId: nickname,
    email: `${nickname}@example.com`,
  })
  const login = await context.app.inject({
    method: 'POST',
    url: '/auth/oauth/google',
    payload: { token: 'stub-token' },
  })
  const { accessToken } = login.json() as { accessToken: string }
  const id = decodeJwt(accessToken).sub
  if (id === undefined) throw new Error('토큰에 sub가 없습니다.')

  const headers = { authorization: `Bearer ${accessToken}` }
  await context.app.inject({ method: 'PATCH', url: '/users/me', headers, payload: { nickname } })
  return { id, headers }
}

function follow(actor: TestUser, target: TestUser) {
  return context.app.inject({
    method: 'POST',
    url: `/users/${target.id}/follow`,
    headers: actor.headers,
  })
}

async function listNicknames(actor: TestUser, path: string): Promise<string[]> {
  const response = await context.app.inject({ method: 'GET', url: path, headers: actor.headers })
  expect(response.statusCode).toBe(200)
  const { items } = response.json() as { items: { nickname: string }[] }
  return items.map((item) => item.nickname)
}

test('맞팔이 성립할 때만 친구가 된다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')

  const oneWay = await follow(alice, bob)
  expect(oneWay.statusCode).toBe(200)
  expect(oneWay.json()).toEqual({ following: true, friend: false })
  expect(await listNicknames(alice, '/users/me/friends')).toEqual([])

  const mutual = await follow(bob, alice)
  expect(mutual.json()).toEqual({ following: true, friend: true })

  expect(await listNicknames(alice, '/users/me/friends')).toEqual(['bob'])
  expect(await listNicknames(bob, '/users/me/friends')).toEqual(['alice'])
  expect(await listNicknames(alice, '/users/me/followees')).toEqual(['bob'])
  expect(await listNicknames(alice, '/users/me/followers')).toEqual(['bob'])
})

test('같은 사용자를 두 번 팔로우해도 친구 관계는 한 번만 생긴다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')

  await follow(alice, bob)
  await follow(bob, alice)
  expect((await follow(alice, bob)).json()).toEqual({ following: true, friend: true })

  expect(await listNicknames(alice, '/users/me/friends')).toEqual(['bob'])
  expect(await listNicknames(alice, '/users/me/followees')).toEqual(['bob'])
})

test('언팔로우하면 친구 관계가 풀리고 반대 방향 팔로우는 남는다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await follow(alice, bob)
  await follow(bob, alice)

  const unfollowed = await context.app.inject({
    method: 'DELETE',
    url: `/users/${bob.id}/follow`,
    headers: alice.headers,
  })
  expect(unfollowed.statusCode).toBe(204)

  expect(await listNicknames(alice, '/users/me/friends')).toEqual([])
  expect(await listNicknames(bob, '/users/me/friends')).toEqual([])
  expect(await listNicknames(alice, '/users/me/followees')).toEqual([])
  expect(await listNicknames(bob, '/users/me/followees')).toEqual(['alice'])
})

test('자기 자신은 팔로우할 수 없다', async () => {
  const alice = await createUser('alice')

  const response = await follow(alice, alice)

  expect(response.statusCode).toBe(400)
  expect(response.json().error.code).toBe('SELF_NOT_ALLOWED')
})

test('차단하면 양방향 관계가 끊기고 차단당한 쪽에서는 존재가 사라진다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await follow(alice, bob)
  await follow(bob, alice)

  const blocked = await context.app.inject({
    method: 'POST',
    url: `/users/${bob.id}/block`,
    headers: alice.headers,
  })
  expect(blocked.statusCode).toBe(204)

  expect(await listNicknames(alice, '/users/me/friends')).toEqual([])
  expect(await listNicknames(bob, '/users/me/friends')).toEqual([])
  expect(await listNicknames(bob, '/users/me/followees')).toEqual([])
  expect(await listNicknames(bob, '/users/me/followers')).toEqual([])

  // 차단당한 쪽에는 프로필도 팔로우도 열리지 않는다.
  const hidden = await context.app.inject({
    method: 'GET',
    url: `/users/${alice.id}`,
    headers: bob.headers,
  })
  expect(hidden.statusCode).toBe(404)
  expect((await follow(bob, alice)).statusCode).toBe(404)

  // 차단한 쪽은 해제할 수 있어야 하므로 상태를 볼 수 있다.
  const seen = await context.app.inject({
    method: 'GET',
    url: `/users/${bob.id}`,
    headers: alice.headers,
  })
  expect(seen.statusCode).toBe(200)
  expect(seen.json()).toMatchObject({ nickname: 'bob', blocking: true, friend: false })
  expect((await follow(alice, bob)).statusCode).toBe(403)

  const unblocked = await context.app.inject({
    method: 'DELETE',
    url: `/users/${bob.id}/block`,
    headers: alice.headers,
  })
  expect(unblocked.statusCode).toBe(204)
  expect((await follow(alice, bob)).json()).toEqual({ following: true, friend: false })
})

test('타인 프로필은 관계 상태와 친구 수를 함께 준다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const carol = await createUser('carol')
  await follow(bob, carol)
  await follow(carol, bob)
  await follow(bob, alice)

  const response = await context.app.inject({
    method: 'GET',
    url: `/users/${bob.id}`,
    headers: alice.headers,
  })

  expect(response.json()).toEqual({
    id: bob.id,
    nickname: 'bob',
    avatarUrl: null,
    friendCount: 1,
    following: false,
    followedBy: true,
    friend: false,
    blocking: false,
  })
})

test('검색은 본인과 차단 상대를 빼고 닉네임 부분 일치로 찾는다', async () => {
  const alice = await createUser('alice')
  const alicia = await createUser('alicia')
  const bob = await createUser('bob')

  expect(await listNicknames(bob, '/users/search?q=ali')).toEqual(['alice', 'alicia'])
  expect(await listNicknames(alice, '/users/search?q=ALI')).toEqual(['alicia'])

  await context.app.inject({
    method: 'POST',
    url: `/users/${bob.id}/block`,
    headers: alicia.headers,
  })
  expect(await listNicknames(bob, '/users/search?q=ali')).toEqual(['alice'])
})

test('추천은 친구의 친구를 먼저 주고 나머지를 신규 가입자로 채운다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const carol = await createUser('carol')
  const dave = await createUser('dave')
  await follow(alice, bob)
  await follow(bob, alice)
  await follow(bob, carol)
  await follow(carol, bob)

  const response = await context.app.inject({
    method: 'GET',
    url: '/users/recommended',
    headers: alice.headers,
  })

  // bob은 이미 팔로우 중이라 빠지고, carol(공통 친구 1) 다음에 dave(신규)가 온다.
  expect(response.json()).toEqual({
    items: [
      { id: carol.id, nickname: 'carol', avatarUrl: null, mutualFriendCount: 1 },
      { id: dave.id, nickname: 'dave', avatarUrl: null, mutualFriendCount: 0 },
    ],
  })
})

test('목록은 커서로 이어서 받을 수 있다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const carol = await createUser('carol')
  await follow(alice, carol)
  await follow(bob, carol)

  const first = await context.app.inject({
    method: 'GET',
    url: '/users/me/followers?limit=1',
    headers: carol.headers,
  })
  const firstPage = first.json() as { items: { nickname: string }[]; nextCursor: string | null }
  expect(firstPage.items).toHaveLength(1)
  expect(firstPage.nextCursor).not.toBeNull()

  const second = await context.app.inject({
    method: 'GET',
    url: `/users/me/followers?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    headers: carol.headers,
  })
  const secondPage = second.json() as { items: { nickname: string }[]; nextCursor: string | null }
  expect(secondPage.items).toHaveLength(1)
  expect(secondPage.nextCursor).toBeNull()

  const seen = [...firstPage.items, ...secondPage.items].map((item) => item.nickname)
  expect(seen.sort()).toEqual(['alice', 'bob'])
})
