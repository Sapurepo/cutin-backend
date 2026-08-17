import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { createFixtures, pngBytes, type TestUser, truncateAll } from './helpers/fixtures.ts'
import { createTestContext, destroyTestContext, type TestContext } from './helpers/testApp.ts'

let context: TestContext

const { createUser, makeFriends, uploadMedia, firstTemplate, publishPost } = createFixtures(
  () => context,
)

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await destroyTestContext(context)
})

beforeEach(async () => {
  await context.database.db.execute(sql.raw(truncateAll))
})

async function feedIds(user: TestUser): Promise<string[]> {
  const response = await context.app.inject({
    method: 'GET',
    url: '/feed',
    headers: user.headers,
  })
  expect(response.statusCode).toBe(200)
  return (response.json() as { items: { id: string }[] }).items.map((item) => item.id)
}

test('draft는 사용자당 하나만 만들 수 있다', async () => {
  const alice = await createUser('alice')
  const template = await firstTemplate(alice)

  const first = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  expect(first.statusCode).toBe(201)
  expect(first.json()).toMatchObject({ status: 'draft', visibility: 'friends', cuts: [] })

  const second = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  expect(second.statusCode).toBe(409)
  expect(second.json().error.code).toBe('DRAFT_ALREADY_EXISTS')

  // 폐기하면 다시 만들 수 있다.
  const postId = (first.json() as { id: string }).id
  const discarded = await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })
  expect(discarded.statusCode).toBe(204)

  const third = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  expect(third.statusCode).toBe(201)
})

test('업로드는 바이트가 도착해야 완료 처리된다', async () => {
  const alice = await createUser('alice')

  const created = await context.app.inject({
    method: 'POST',
    url: '/media/uploads',
    headers: alice.headers,
    payload: { kind: 'cut', mime: 'image/png' },
  })
  const target = created.json() as { mediaId: string; url: string }

  const tooEarly = await context.app.inject({
    method: 'POST',
    url: `/media/${target.mediaId}/complete`,
    headers: alice.headers,
    payload: { width: 1, height: 1 },
  })
  expect(tooEarly.statusCode).toBe(400)
  expect(tooEarly.json().error.code).toBe('UPLOAD_NOT_FOUND')

  await context.app.inject({
    method: 'PUT',
    url: new URL(target.url).pathname,
    headers: { ...alice.headers, 'content-type': 'image/png' },
    payload: pngBytes,
  })
  const completed = await context.app.inject({
    method: 'POST',
    url: `/media/${target.mediaId}/complete`,
    headers: alice.headers,
    payload: { width: 1, height: 1 },
  })
  expect(completed.statusCode).toBe(200)

  // 올린 바이트를 그대로 다시 받을 수 있다.
  const fetched = await context.app.inject({ method: 'GET', url: new URL(target.url).pathname })
  expect(fetched.statusCode).toBe(200)
  expect(fetched.rawPayload.equals(pngBytes)).toBe(true)
})

/**
 * 업로드 목적지와 미디어 URL은 다른 도메인에서 온다. CDN이 붙으면 후자만 갈라지고,
 * 서명 URL로 가면 전자가 벤더 도메인이 된다 — 클라이언트는 둘 다 절대 URL로 받아
 * 그대로 써야 하고 baseURL과 조립하면 안 된다.
 */
test('미디어 URL은 업로드 목적지와 다른 도메인으로 나간다', async () => {
  const alice = await createUser('alice')
  const created = await context.app.inject({
    method: 'POST',
    url: '/media/uploads',
    headers: alice.headers,
    payload: { kind: 'cut', mime: 'image/png' },
  })
  const target = created.json() as { mediaId: string; url: string }
  expect(target.url.startsWith('http://test.local/')).toBe(true)

  await context.app.inject({
    method: 'PUT',
    url: new URL(target.url).pathname,
    headers: { ...alice.headers, 'content-type': 'image/png' },
    payload: pngBytes,
  })
  const completed = await context.app.inject({
    method: 'POST',
    url: `/media/${target.mediaId}/complete`,
    headers: alice.headers,
    payload: { width: 1, height: 1 },
  })
  expect(completed.statusCode).toBe(200)
  expect((completed.json() as { url: string }).url.startsWith('http://cdn.test.local/')).toBe(true)
})

/**
 * 업로드 상한(15MB)은 Fastify 본문 파서 옵션이 강제한다.
 * 어댑터가 FST_ERR_* 코드를 버리므로 상태 코드로만 구분되는데,
 * 사용자에게 보여줄 문구가 달린 자리라 code를 고정해 둔다.
 */
test('상한을 넘는 업로드는 413으로 막힌다', async () => {
  const alice = await createUser('alice')
  const created = await context.app.inject({
    method: 'POST',
    url: '/media/uploads',
    headers: alice.headers,
    payload: { kind: 'cut', mime: 'image/png' },
  })
  const { url } = created.json() as { url: string }

  const response = await context.app.inject({
    method: 'PUT',
    url: new URL(url).pathname,
    headers: { ...alice.headers, 'content-type': 'image/png' },
    payload: Buffer.alloc(16 * 1024 * 1024),
  })

  expect(response.statusCode).toBe(413)
  expect(response.json().error.code).toBe('PAYLOAD_TOO_LARGE')
})

test('컷이 덜 찼거나 합성본이 없으면 발행되지 않는다', async () => {
  const alice = await createUser('alice')
  const template = await firstTemplate(alice)
  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  const postId = (draft.json() as { id: string }).id
  const composedMediaId = await uploadMedia(alice, 'composed')

  const noCuts = await context.app.inject({
    method: 'POST',
    url: `/posts/${postId}/publish`,
    headers: alice.headers,
    payload: { composedMediaId },
  })
  expect(noCuts.statusCode).toBe(400)
  expect(noCuts.json().error.code).toBe('CUTS_INCOMPLETE')

  // 업로드가 끝나지 않은 컷은 붙일 수 없다.
  const pending = await context.app.inject({
    method: 'POST',
    url: '/media/uploads',
    headers: alice.headers,
    payload: { kind: 'cut', mime: 'image/png' },
  })
  const pendingId = (pending.json() as { mediaId: string }).mediaId
  const notReady = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { cuts: [{ cutIndex: 0, mediaId: pendingId }] },
  })
  expect(notReady.statusCode).toBe(400)
  expect(notReady.json().error.code).toBe('MEDIA_NOT_READY')

  // 템플릿 컷 수를 넘는 자리도 막는다.
  const cutMediaId = await uploadMedia(alice, 'cut')
  const outOfRange = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { cuts: [{ cutIndex: template.cutCount, mediaId: cutMediaId }] },
  })
  expect(outOfRange.statusCode).toBe(400)
  expect(outOfRange.json().error.code).toBe('CUT_INDEX_OUT_OF_RANGE')
})

/**
 * iOS의 Swift UUID는 JSON에서 대문자로 직렬화된다. DB는 소문자를 돌려주므로
 * 문자열로 비교하면 ready인 컷도 거절된다 — 대소문자 무관하게 붙어야 한다.
 */
test('대문자 mediaId로도 컷을 붙일 수 있다', async () => {
  const alice = await createUser('alice')
  const template = await firstTemplate(alice)
  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  const postId = (draft.json() as { id: string }).id
  const cutMediaId = await uploadMedia(alice, 'cut')

  const attached = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { cuts: [{ cutIndex: 0, mediaId: cutMediaId.toUpperCase() }] },
  })
  expect(attached.statusCode).toBe(200)
})

test('발행하면 draft가 풀리고 컷과 합성본이 함께 조회된다', async () => {
  const alice = await createUser('alice')
  const postId = await publishPost(alice)

  const detail = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })
  const post = detail.json() as {
    status: string
    thumbnailCutIndex: number
    publishedAt: string | null
    cuts: { cutIndex: number; media: { url: string } }[]
    composed: { url: string } | null
  }
  expect(post.status).toBe('published')
  // 썸네일 미지정 시 첫 컷이 대표가 된다 (§6.3).
  expect(post.thumbnailCutIndex).toBe(0)
  expect(post.publishedAt).not.toBeNull()
  expect(post.cuts).toHaveLength(1)
  expect(post.composed).not.toBeNull()

  const noDraft = await context.app.inject({
    method: 'GET',
    url: '/posts/draft',
    headers: alice.headers,
  })
  expect(noDraft.statusCode).toBe(404)
})

test('발행된 포스트는 대표 컷만 바꿀 수 있다 — 고정 해제는 0', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')

  // 두 컷짜리 템플릿 — 대표 컷을 1로 지정해야 "고정"이 된다.
  const templates = await context.app.inject({
    method: 'GET',
    url: '/templates',
    headers: alice.headers,
  })
  const { items } = templates.json() as { items: { id: string; cutCount: number }[] }
  const template = items.find((item) => item.cutCount === 2)
  expect(template).toBeDefined()

  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template?.id },
  })
  const postId = (draft.json() as { id: string }).id
  const cuts = [await uploadMedia(alice, 'cut'), await uploadMedia(alice, 'cut')]
  await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: {
      cuts: cuts.map((mediaId, cutIndex) => ({ cutIndex, mediaId })),
      thumbnailCutIndex: 1,
    },
  })
  const composedMediaId = await uploadMedia(alice, 'composed')
  const published = await context.app.inject({
    method: 'POST',
    url: `/posts/${postId}/publish`,
    headers: alice.headers,
    payload: { composedMediaId, visibility: 'public' },
  })
  expect(published.statusCode).toBe(200)
  expect((published.json() as { thumbnailCutIndex: number }).thumbnailCutIndex).toBe(1)

  // 고정 해제 — 0으로.
  const unpin = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { thumbnailCutIndex: 0 },
  })
  expect(unpin.statusCode).toBe(200)
  expect((unpin.json() as { thumbnailCutIndex: number }).thumbnailCutIndex).toBe(0)

  // 다시 지정도 된다. null은 발행본에서 0으로 남는다(발행본은 항상 non-null).
  const repin = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { thumbnailCutIndex: 1 },
  })
  expect((repin.json() as { thumbnailCutIndex: number }).thumbnailCutIndex).toBe(1)
  const nulled = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { thumbnailCutIndex: null },
  })
  expect((nulled.json() as { thumbnailCutIndex: number }).thumbnailCutIndex).toBe(0)

  // 범위 밖은 여전히 막힌다.
  const outOfRange = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { thumbnailCutIndex: 5 },
  })
  expect(outOfRange.statusCode).toBe(400)

  // 다른 필드가 섞이면 발행본 편집 거절.
  const caption = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { caption: '나중에 고침', thumbnailCutIndex: 0 },
  })
  expect(caption.statusCode).toBe(400)
  expect((caption.json() as { error: { code: string } }).error.code).toBe('POST_NOT_DRAFT')

  // 남의 포스트는 없는 것으로.
  const bobs = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: bob.headers,
    payload: { thumbnailCutIndex: 0 },
  })
  expect(bobs.statusCode).toBe(404)
})

test('친구공개 포스트는 맞팔 관계에만 보인다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const carol = await createUser('carol')
  await makeFriends(alice, bob)
  // carol은 alice를 팔로우만 한다. 맞팔이 아니므로 친구가 아니다.
  await context.app.inject({
    method: 'POST',
    url: `/users/${alice.id}/follow`,
    headers: carol.headers,
  })

  const postId = await publishPost(alice, 'friends')

  expect(await feedIds(alice)).toEqual([postId])
  expect(await feedIds(bob)).toEqual([postId])
  expect(await feedIds(carol)).toEqual([])

  const forbidden = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: carol.headers,
  })
  expect(forbidden.statusCode).toBe(404)
})

test('전체공개는 남에게도, 비공개는 본인에게만 보인다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')

  const publicPostId = await publishPost(alice, 'public')
  expect(await feedIds(bob)).toEqual([publicPostId])

  await context.app.inject({
    method: 'DELETE',
    url: `/posts/${publicPostId}`,
    headers: alice.headers,
  })
  const privatePostId = await publishPost(alice, 'private')
  expect(await feedIds(bob)).toEqual([])
  expect(await feedIds(alice)).toEqual([privatePostId])
})

test('차단하면 친구였더라도 서로의 포스트가 사라진다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  await makeFriends(alice, bob)
  const postId = await publishPost(alice, 'friends')
  expect(await feedIds(bob)).toEqual([postId])

  await context.app.inject({
    method: 'POST',
    url: `/users/${bob.id}/block`,
    headers: alice.headers,
  })

  expect(await feedIds(bob)).toEqual([])
  expect(await feedIds(alice)).toEqual([postId])
})

test('삭제한 포스트는 목록과 상세에서 모두 빠진다', async () => {
  const alice = await createUser('alice')
  const postId = await publishPost(alice, 'public')

  await context.app.inject({
    method: 'DELETE',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })

  expect(await feedIds(alice)).toEqual([])
  const detail = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })
  expect(detail.statusCode).toBe(404)
})

test('사용자 포스트 목록은 피드와 같은 노출 규칙을 쓴다', async () => {
  const alice = await createUser('alice')
  const bob = await createUser('bob')
  const postId = await publishPost(alice, 'friends')

  const stranger = await context.app.inject({
    method: 'GET',
    url: `/users/${alice.id}/posts`,
    headers: bob.headers,
  })
  expect((stranger.json() as { items: unknown[] }).items).toEqual([])

  await makeFriends(alice, bob)
  const friend = await context.app.inject({
    method: 'GET',
    url: `/users/${alice.id}/posts`,
    headers: bob.headers,
  })
  expect((friend.json() as { items: { id: string }[] }).items.map((item) => item.id)).toEqual([
    postId,
  ])
})

test('아바타를 올리면 프로필과 포스트 작성자에 함께 반영된다', async () => {
  const alice = await createUser('alice')
  const avatarMediaId = await uploadMedia(alice, 'avatar')

  const patched = await context.app.inject({
    method: 'PATCH',
    url: '/users/me',
    headers: alice.headers,
    payload: { avatarMediaId },
  })
  expect(patched.statusCode).toBe(200)
  const avatarUrl = (patched.json() as { avatarUrl: string | null }).avatarUrl
  expect(avatarUrl).not.toBeNull()

  const postId = await publishPost(alice, 'public')
  const detail = await context.app.inject({
    method: 'GET',
    url: `/posts/${postId}`,
    headers: alice.headers,
  })
  expect((detail.json() as { author: { avatarUrl: string } }).author.avatarUrl).toBe(avatarUrl)
})

test('템플릿 8종이 내려오고 격자가 아닌 레이아웃도 표현된다', async () => {
  const alice = await createUser('alice')

  const response = await context.app.inject({
    method: 'GET',
    url: '/templates',
    headers: alice.headers,
  })
  const { items } = response.json() as {
    items: { code: string; cutCount: number; aspectRatio: string; slots: unknown[] }[]
  }

  expect(items.map((item) => item.code)).toEqual([
    'single',
    'strip2',
    'pair2',
    'grid4',
    'strip4',
    'strip4wide',
    'bigLeft',
    'grid6',
  ])

  // 두 컷은 세로(1:2)와 가로(2:1) 둘 다 있다.
  expect(items.find((item) => item.code === 'strip2')?.aspectRatio).toBe('1:2')
  expect(items.find((item) => item.code === 'pair2')?.aspectRatio).toBe('2:1')

  // 격자로 떨어지지 않는 bigLeft도 cutCount가 자리 개수와 맞는다.
  const bigLeft = items.find((item) => item.code === 'bigLeft')
  expect(bigLeft?.cutCount).toBe(4)
  expect(bigLeft?.slots).toHaveLength(4)
  expect(bigLeft?.slots[0]).toMatchObject({ x: 0, y: 0, height: 1 })
})

test('프레임 8종이 비율값으로 내려온다', async () => {
  const alice = await createUser('alice')

  const response = await context.app.inject({
    method: 'GET',
    url: '/frames',
    headers: alice.headers,
  })
  expect(response.statusCode).toBe(200)
  const { items } = response.json() as {
    items: { code: string; padding: number; footer: string | null }[]
  }

  expect(items).toHaveLength(8)
  // 첫 항목이 기본 외형이다 — 앞에 끼워 넣으면 frame이 null인 기존 포스트가 달라 보인다.
  expect(items[0]?.code).toBe('basic')
  // basic만 푸터가 없다.
  expect(items.filter((item) => item.footer === null).map((item) => item.code)).toEqual(['basic'])
  // 길이는 캔버스 폭 대비 비율이므로 숫자여야 한다 (numeric이면 문자열로 나온다).
  expect(typeof items[0]?.padding).toBe('number')
  expect(items[0]?.padding).toBeLessThan(1)
})

test('draft에 프레임을 붙이면 포스트에 실린다', async () => {
  const alice = await createUser('alice')
  const template = await firstTemplate(alice)
  const frames = await context.app.inject({
    method: 'GET',
    url: '/frames',
    headers: alice.headers,
  })
  const noir = (frames.json() as { items: { id: string; code: string }[] }).items.find(
    (item) => item.code === 'noir',
  )

  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  const postId = (draft.json() as { id: string }).id
  expect(draft.json().frame).toBeNull()

  const patched = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { frameId: noir?.id },
  })
  expect(patched.statusCode).toBe(200)
  expect(patched.json().frame).toMatchObject({ code: 'noir', background: '#111113' })

  // null은 선택 해제다. 서버가 기본 외형으로 채워 내려보내지 않는다.
  const cleared = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { frameId: null },
  })
  expect(cleared.json().frame).toBeNull()
})

test('없는 프레임은 400으로 막는다', async () => {
  const alice = await createUser('alice')
  const template = await firstTemplate(alice)
  const draft = await context.app.inject({
    method: 'POST',
    url: '/posts',
    headers: alice.headers,
    payload: { templateId: template.id },
  })
  const postId = (draft.json() as { id: string }).id

  const response = await context.app.inject({
    method: 'PATCH',
    url: `/posts/${postId}`,
    headers: alice.headers,
    payload: { frameId: '11111111-1111-4111-8111-111111111111' },
  })

  expect(response.statusCode).toBe(400)
  expect(response.json().error.code).toBe('FRAME_NOT_FOUND')
})
