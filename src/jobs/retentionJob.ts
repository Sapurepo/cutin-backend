import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { DATABASE } from '../db/databaseModule.ts'
import { comments, media, postCuts, posts } from '../db/schema/index.ts'

/** draft 만료 (명세 §5.3) */
export const DRAFT_TTL_HOURS = 24

/** 소프트 삭제 보존 기간. 명세 미결항목 #7에서 1년으로 확정됐다. */
export const RETENTION_DAYS = 365

function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

@Injectable()
export class RetentionJob {
  private readonly logger = new Logger(RetentionJob.name)

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * 24시간이 지난 draft를 정리한다. 발행된 포스트는 건드리지 않는다 —
   * `status = 'draft'` 조건이 그것을 보장하고, 소프트 삭제이므로 부분 유니크 인덱스가
   * 풀려 사용자는 새 draft를 만들 수 있게 된다.
   */
  async expireDrafts(now: Date): Promise<{ expired: number }> {
    const rows = await this.db
      .update(posts)
      .set({ status: 'deleted', deletedAt: now, updatedAt: now })
      .where(and(eq(posts.status, 'draft'), lt(posts.createdAt, hoursBefore(now, DRAFT_TTL_HOURS))))
      .returning({ id: posts.id })

    if (rows.length > 0) this.logger.log(`만료 draft ${rows.length}건 정리`)
    return { expired: rows.length }
  }

  /**
   * 보존 기간이 지난 소프트 삭제 데이터를 실제로 지운다.
   * 참조 순서대로 지워야 FK에 걸리지 않는다: 컷 → 포스트 → 댓글 → 미디어.
   *
   * 사용자 계정은 아직 대상이 아니다. 탈퇴 엔드포인트가 없어 `users.deletedAt`이
   * 채워지는 경로가 없고, 계정 purge는 identities·follows까지 함께 봐야 해서
   * 어드민(P6)에서 다룬다.
   */
  async purge(now: Date): Promise<{ posts: number; comments: number; media: number }> {
    const cutoff = hoursBefore(now, RETENTION_DAYS * 24)

    return this.db.transaction(async (tx) => {
      const expiredPosts = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(isNotNull(posts.deletedAt), lt(posts.deletedAt, cutoff)))

      if (expiredPosts.length > 0) {
        const ids = expiredPosts.map((row) => row.id)
        await tx.delete(postCuts).where(inArray(postCuts.postId, ids))
        await tx.delete(posts).where(inArray(posts.id, ids))
      }

      const purgedComments = await tx
        .delete(comments)
        .where(and(isNotNull(comments.deletedAt), lt(comments.deletedAt, cutoff)))
        .returning({ id: comments.id })

      const purgedMedia = await tx
        .delete(media)
        .where(and(isNotNull(media.deletedAt), lt(media.deletedAt, cutoff)))
        .returning({ id: media.id })

      const result = {
        posts: expiredPosts.length,
        comments: purgedComments.length,
        media: purgedMedia.length,
      }
      if (result.posts + result.comments + result.media > 0) {
        this.logger.log(
          `보존기간 경과 purge — 포스트 ${result.posts} · 댓글 ${result.comments} · 미디어 ${result.media}`,
        )
      }
      return result
    })
  }
}
