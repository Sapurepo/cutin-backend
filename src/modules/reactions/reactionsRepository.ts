import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import { type Reaction, type ReactionType, reactions } from '../../db/schema/index.ts'

@Injectable()
export class ReactionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  find(postId: string, userId: string): Promise<Reaction | undefined> {
    return this.db.query.reactions.findFirst({
      where: and(eq(reactions.postId, postId), eq(reactions.userId, userId)),
    })
  }

  /** 같은 사용자가 다시 누르면 종류만 바뀐다. 유니크 인덱스가 1인 1반응을 보장한다. */
  async upsert(postId: string, userId: string, type: ReactionType): Promise<void> {
    await this.db
      .insert(reactions)
      .values({ postId, userId, type })
      .onConflictDoUpdate({
        target: [reactions.postId, reactions.userId],
        set: { type, createdAt: new Date() },
      })
  }

  async remove(postId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(reactions)
      .where(and(eq(reactions.postId, postId), eq(reactions.userId, userId)))
      .returning({ id: reactions.id })
    return rows.length > 0
  }
}
