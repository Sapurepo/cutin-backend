import { Module } from '@nestjs/common'
import { MediaModule } from '../media/mediaModule.ts'
import { PostsModule } from '../posts/postsModule.ts'
import { ShareController } from './shareController.ts'
import { ShareService } from './shareService.ts'

@Module({
  imports: [PostsModule, MediaModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
