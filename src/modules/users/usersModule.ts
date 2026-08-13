import { Module } from '@nestjs/common'
import { MediaModule } from '../media/mediaModule.ts'
import { UsersController } from './usersController.ts'
import { UsersRepository } from './usersRepository.ts'
import { UsersService } from './usersService.ts'

@Module({
  // 아바타 미디어가 내 것이면서 업로드가 끝났는지 확인해야 한다.
  imports: [MediaModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
