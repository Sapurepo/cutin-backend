import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { DatabaseModule } from './db/databaseModule.ts'
import { JobsModule } from './jobs/jobsModule.ts'
import { AuthModule } from './modules/auth/authModule.ts'
import { BookmarksModule } from './modules/bookmarks/bookmarksModule.ts'
import { CommentsModule } from './modules/comments/commentsModule.ts'
import { DevicesModule } from './modules/devices/devicesModule.ts'
import { HealthModule } from './modules/health/healthModule.ts'
import { MediaModule } from './modules/media/mediaModule.ts'
import { NotificationsModule } from './modules/notifications/notificationsModule.ts'
import { PostsModule } from './modules/posts/postsModule.ts'
import { ReactionsModule } from './modules/reactions/reactionsModule.ts'
import { ReportsModule } from './modules/reports/reportsModule.ts'
import { SocialModule } from './modules/social/socialModule.ts'
import { UsersModule } from './modules/users/usersModule.ts'
import { AuthGuard } from './shared/auth/authGuard.ts'
import { AppExceptionFilter } from './shared/errors/appExceptionFilter.ts'
import { PushModule } from './shared/push/pushModule.ts'
import { StorageModule } from './shared/storage/storageModule.ts'

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    PushModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MediaModule,
    PostsModule,
    SocialModule,
    CommentsModule,
    ReactionsModule,
    BookmarksModule,
    NotificationsModule,
    ReportsModule,
    DevicesModule,
    JobsModule,
  ],
  providers: [
    // 인증은 전역이 기본이고 `@Public()`으로만 뚫는다.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
  ],
})
export class AppModule {}
