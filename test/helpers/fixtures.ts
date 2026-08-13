import { decodeJwt } from 'jose'
import { expect } from 'vitest'
import type { TestContext } from './testApp.ts'

export interface TestUser {
  id: string
  headers: { authorization: string }
}

/** 1x1 투명 PNG. 실제 바이트를 올려야 complete가 통과한다. */
export const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** 모든 테이블을 비운다. 새 테이블이 생기면 여기에 더한다. */
export const truncateAll = `truncate table devices, reports, notifications, reactions, comments,
  post_cuts, posts, media, blocks, follows, friendships,
  refresh_tokens, notification_preferences, identities, users cascade`

export function createFixtures(getContext: () => TestContext) {
  const context = () => getContext()

  async function createUser(nickname: string): Promise<TestUser> {
    context().oauth.setProfile({
      provider: 'google',
      providerUserId: nickname,
      email: `${nickname}@example.com`,
    })
    const login = await context().app.inject({
      method: 'POST',
      url: '/auth/oauth/google',
      payload: { token: 'stub-token' },
    })
    const { accessToken } = login.json() as { accessToken: string }
    const id = decodeJwt(accessToken).sub
    if (id === undefined) throw new Error('토큰에 sub가 없습니다.')

    const headers = { authorization: `Bearer ${accessToken}` }
    await context().app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers,
      payload: { nickname },
    })
    return { id, headers }
  }

  async function makeFriends(a: TestUser, b: TestUser): Promise<void> {
    await context().app.inject({ method: 'POST', url: `/users/${b.id}/follow`, headers: a.headers })
    await context().app.inject({ method: 'POST', url: `/users/${a.id}/follow`, headers: b.headers })
  }

  /** 목적지 발급 → 바이트 PUT → complete까지 한 번에 돌린다. */
  async function uploadMedia(user: TestUser, kind: 'cut' | 'composed' | 'avatar'): Promise<string> {
    const created = await context().app.inject({
      method: 'POST',
      url: '/media/uploads',
      headers: user.headers,
      payload: { kind, mime: 'image/png' },
    })
    expect(created.statusCode).toBe(201)
    const target = created.json() as { mediaId: string; url: string }

    await context().app.inject({
      method: 'PUT',
      url: new URL(target.url).pathname,
      headers: { ...user.headers, 'content-type': 'image/png' },
      payload: pngBytes,
    })
    const completed = await context().app.inject({
      method: 'POST',
      url: `/media/${target.mediaId}/complete`,
      headers: user.headers,
      payload: { width: 1, height: 1 },
    })
    expect(completed.statusCode).toBe(200)
    return target.mediaId
  }

  async function firstTemplate(user: TestUser): Promise<{ id: string; cutCount: number }> {
    const response = await context().app.inject({
      method: 'GET',
      url: '/templates',
      headers: user.headers,
    })
    const { items } = response.json() as { items: { id: string; cutCount: number }[] }
    const single = items.find((item) => item.cutCount === 1)
    if (single === undefined) throw new Error('1컷 템플릿이 없습니다.')
    return single
  }

  /** draft 생성 → 컷 첨부 → 발행까지의 전체 경로 */
  async function publishPost(
    user: TestUser,
    visibility: 'friends' | 'public' | 'private' = 'friends',
  ): Promise<string> {
    const template = await firstTemplate(user)
    const draft = await context().app.inject({
      method: 'POST',
      url: '/posts',
      headers: user.headers,
      payload: { templateId: template.id },
    })
    expect(draft.statusCode).toBe(201)
    const postId = (draft.json() as { id: string }).id

    const cutMediaId = await uploadMedia(user, 'cut')
    await context().app.inject({
      method: 'PATCH',
      url: `/posts/${postId}`,
      headers: user.headers,
      payload: { cuts: [{ cutIndex: 0, mediaId: cutMediaId }] },
    })

    const composedMediaId = await uploadMedia(user, 'composed')
    const published = await context().app.inject({
      method: 'POST',
      url: `/posts/${postId}/publish`,
      headers: user.headers,
      payload: { composedMediaId, visibility },
    })
    expect(published.statusCode).toBe(200)
    return postId
  }

  return { createUser, makeFriends, uploadMedia, firstTemplate, publishPost }
}
