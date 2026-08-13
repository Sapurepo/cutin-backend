import { relations } from 'drizzle-orm'
import { comments } from './comments.ts'
import { media } from './media.ts'
import { notifications } from './notifications.ts'
import { postCuts, posts } from './posts.ts'
import { templates } from './templates.ts'
import { users } from './users.ts'

/** 포스트 한 건을 그리려면 작성자·템플릿·컷·합성본이 함께 필요해 관계로 묶어둔다. */
export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  template: one(templates, {
    fields: [posts.templateId],
    references: [templates.id],
  }),
  composed: one(media, {
    fields: [posts.composedMediaId],
    references: [media.id],
  }),
  cuts: many(postCuts),
}))

export const postCutsRelations = relations(postCuts, ({ one }) => ({
  post: one(posts, { fields: [postCuts.postId], references: [posts.id] }),
  media: one(media, { fields: [postCuts.mediaId], references: [media.id] }),
}))

export const usersRelations = relations(users, ({ one }) => ({
  avatar: one(media, { fields: [users.avatarMediaId], references: [media.id] }),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
  }),
}))
