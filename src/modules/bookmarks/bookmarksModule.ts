import { Module } from '@nestjs/common'
import { PostsModule } from '../posts/postsModule.ts'
import { BookmarksController } from './bookmarksController.ts'
import { BookmarksRepository } from './bookmarksRepository.ts'
import { BookmarksService } from './bookmarksService.ts'

@Module({
  // 노출 판정(isVisible)을 재사용한다.
  imports: [PostsModule],
  controllers: [BookmarksController],
  providers: [BookmarksService, BookmarksRepository],
})
export class BookmarksModule {}
