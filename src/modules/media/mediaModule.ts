import { Module } from '@nestjs/common'
import { MediaController } from './mediaController.ts'
import { MediaRepository } from './mediaRepository.ts'
import { MediaService } from './mediaService.ts'

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaRepository],
  // users·posts가 "내 것이면서 업로드가 끝난 미디어인지"를 확인해야 한다.
  exports: [MediaService, MediaRepository],
})
export class MediaModule {}
