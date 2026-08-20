import { Module } from '@nestjs/common'
import { MediaModule } from '../media/mediaModule.ts'
import { PostsController } from './postsController.ts'
import { PostsRepository } from './postsRepository.ts'
import { PostsService } from './postsService.ts'

@Module({
  imports: [MediaModule],
  controllers: [PostsController],
  providers: [PostsService, PostsRepository],
  // comments·reactions가 포스트 가시성 판정과 집계를 재사용한다.
  exports: [PostsRepository],
})
export class PostsModule {}
