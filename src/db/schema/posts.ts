import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { frames } from './frames.ts'
import { media } from './media.ts'
import { templates } from './templates.ts'
import { users } from './users.ts'

export const postStatuses = ['draft', 'published', 'deleted'] as const
export type PostStatus = (typeof postStatuses)[number]

export const postVisibilities = ['friends', 'public', 'private'] as const
export type PostVisibility = (typeof postVisibilities)[number]

export const posts = pgTable(
  'posts',
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    status: text({ enum: postStatuses }).notNull().default('draft'),
    templateId: uuid()
      .notNull()
      .references(() => templates.id),
    /**
     * 외형 선택. 서버는 이것으로 렌더링하지 않는다 —
     * 합성본은 구워진 이미지라, draft 이어쓰기와 재편집을 위한 상태다.
     */
    frameId: uuid().references(() => frames.id),
    /** iOS가 만든 합성본. 발행 전에는 없다. */
    composedMediaId: uuid().references(() => media.id),
    /**
     * 네컷을 찍는 동안 기록된 영상(`media.kind = 'motion'`). 합성본의 움직이는 짝이다.
     * 없을 수 있다 — 녹화가 실패하거나 권한이 없어도 발행은 막지 않는다.
     */
    motionMediaId: uuid().references(() => media.id),
    thumbnailCutIndex: integer(),
    /**
     * 프로필 그리드 맨 앞 고정(iOS §6.3). 대표 컷과 별개의 값이다 — 0.3.0은 "대표 컷을 직접 지정하면
     * 고정"으로 묶었는데, 발행 시 미지정을 0으로 채우면서 "지정 안 함"이 사라져 전부 고정처럼 보였다(#13).
     */
    pinned: boolean().notNull().default(false),
    caption: text(),
    visibility: text({ enum: postVisibilities }).notNull().default('friends'),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // draft 1개 제한은 애플리케이션이 아니라 이 부분 유니크 인덱스가 강제한다.
    uniqueIndex('posts_author_draft_idx').on(table.authorId).where(sql`status = 'draft'`),
    index('posts_author_published_at_idx').on(table.authorId, table.publishedAt),
    index('posts_published_at_idx').on(table.publishedAt),
  ],
)

export const postCuts = pgTable(
  'post_cuts',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id),
    cutIndex: integer().notNull(),
    mediaId: uuid()
      .notNull()
      .references(() => media.id),
  },
  (table) => [primaryKey({ columns: [table.postId, table.cutIndex] })],
)

export type Post = typeof posts.$inferSelect
export type PostCut = typeof postCuts.$inferSelect
