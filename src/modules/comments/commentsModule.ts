import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notificationsModule.ts'
import { PostsModule } from '../posts/postsModule.ts'
import { CommentsController } from './commentsController.ts'
import { CommentsRepository } from './commentsRepository.ts'
import { CommentsService } from './commentsService.ts'

@Module({
  imports: [PostsModule, NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
