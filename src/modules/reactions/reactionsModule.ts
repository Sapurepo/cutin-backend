import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notificationsModule.ts'
import { PostsModule } from '../posts/postsModule.ts'
import { ReactionsController } from './reactionsController.ts'
import { ReactionsRepository } from './reactionsRepository.ts'
import { ReactionsService } from './reactionsService.ts'

@Module({
  imports: [PostsModule, NotificationsModule],
  controllers: [ReactionsController],
  providers: [ReactionsService, ReactionsRepository],
})
export class ReactionsModule {}
