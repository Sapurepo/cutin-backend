import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import { bookmarks } from '../../db/schema/index.ts'

@Injectable()
export class BookmarksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 멱등이다. 유니크 인덱스에 걸리면 아무 일도 일어나지 않는다. */
  async add(postId: string, userId: string): Promise<void> {
    await this.db.insert(bookmarks).values({ postId, userId }).onConflictDoNothing()
  }

  /** 없던 것을 지워도 오류가 아니다 — 상태 지정이지 토글이 아니다. */
  async remove(postId: string, userId: string): Promise<void> {
    await this.db
      .delete(bookmarks)
      .where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, userId)))
  }
}
