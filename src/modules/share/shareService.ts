import { Injectable } from '@nestjs/common'
import { MediaService } from '../media/mediaService.ts'
import { PostsRepository } from '../posts/postsRepository.ts'
import type { SharePageData } from './sharePage.ts'

@Injectable()
export class ShareService {
  constructor(
    private readonly posts: PostsRepository,
    private readonly media: MediaService,
  ) {}

  /**
   * 공유 링크·QR이 여는 포스트. 로그인한 사람이 없으므로 **가시성 판정에 뷰어가 없다.**
   *
   * 사용자 결정(2026-08-25): 링크를 아는 사람은 누구나 본다(unlisted). QR은 오프라인에서
   * 남에게 보여주려고 찍는 것이라, 친구 목록을 요구하면 기능이 죽는다. 막는 것은 `private`
   * 하나다 — 그건 "나만 본다"는 뜻이고 링크를 줬다고 뒤집을 값이 아니다.
   *
   * 발행되지 않은 것(draft·삭제)도 나가지 않는다. 없는 포스트와 같은 화면으로 떨어뜨려
   * 존재 여부 자체를 알려 주지 않는다.
   */
  async findSharedPost(postId: string): Promise<SharePageData | undefined> {
    const [post] = await this.posts.loadPosts([postId])
    if (post === undefined) return undefined
    if (post.status !== 'published' || post.visibility === 'private') return undefined
    if (post.composed === null) return undefined

    return {
      nickname: post.author.nickname ?? '누군가',
      caption: post.caption,
      composedUrl: this.media.toView(post.composed).url,
      motionUrl: post.motion === null ? null : this.media.toView(post.motion).url,
      publishedAt: post.publishedAt,
    }
  }
}
