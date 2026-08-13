import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import { type Media, type MediaKind, media } from '../../db/schema/index.ts'

@Injectable()
export class MediaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(values: {
    ownerId: string
    kind: MediaKind
    mime: string
    storageKey: string
  }): Promise<Media> {
    const [row] = await this.db.insert(media).values(values).returning()
    if (row === undefined) throw new Error('미디어 생성에 실패했습니다.')
    return row
  }

  findById(mediaId: string): Promise<Media | undefined> {
    return this.db.query.media.findFirst({
      where: and(eq(media.id, mediaId), isNull(media.deletedAt)),
    })
  }

  findByStorageKey(storageKey: string): Promise<Media | undefined> {
    return this.db.query.media.findFirst({
      where: and(eq(media.storageKey, storageKey), isNull(media.deletedAt)),
    })
  }

  /** 포스트 발행 시 컷들이 모두 업로드 완료됐는지 한 번에 확인하기 위한 조회 */
  findReadyByIds(mediaIds: string[], ownerId: string): Promise<Media[]> {
    if (mediaIds.length === 0) return Promise.resolve([])
    return this.db.query.media.findMany({
      where: and(
        inArray(media.id, mediaIds),
        eq(media.ownerId, ownerId),
        eq(media.status, 'ready'),
        isNull(media.deletedAt),
      ),
    })
  }

  async markReady(
    mediaId: string,
    values: { bytes: number; width: number; height: number },
  ): Promise<Media | undefined> {
    const [row] = await this.db
      .update(media)
      .set({ ...values, status: 'ready' })
      .where(eq(media.id, mediaId))
      .returning()
    return row
  }
}
