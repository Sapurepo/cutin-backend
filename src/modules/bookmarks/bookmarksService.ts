import { Injectable } from '@nestjs/common'
import { AppError } from '../../shared/errors/appError.ts'
import { PostsRepository } from '../posts/postsRepository.ts'
import { BookmarksRepository } from './bookmarksRepository.ts'

@Injectable()
export class BookmarksService {
  constructor(
    private readonly repository: BookmarksRepository,
    private readonly postsRepository: PostsRepository,
  ) {}

  async add(viewerId: string, postId: string): Promise<{ bookmarked: boolean }> {
    await this.requireVisiblePost(viewerId, postId)
    await this.repository.add(postId, viewerId)
    return { bookmarked: true }
  }

  async remove(viewerId: string, postId: string): Promise<{ bookmarked: boolean }> {
    await this.requireVisiblePost(viewerId, postId)
    await this.repository.remove(postId, viewerId)
    return { bookmarked: false }
  }

  /** 볼 수 없는 포스트는 보관할 수도 없다. 피드·댓글·반응과 같은 판정을 쓴다. */
  private async requireVisiblePost(viewerId: string, postId: string): Promise<void> {
    if (!(await this.postsRepository.isVisible(viewerId, postId))) {
      throw AppError.notFound('POST_NOT_FOUND', '포스트를 찾을 수 없습니다.')
    }
  }
}
