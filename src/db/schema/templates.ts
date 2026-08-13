import { boolean, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

/** 컷이 놓이는 자리. 0~1 비율 좌표라 클라이언트 해상도와 무관하다. */
export interface TemplateSlot {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 합성은 iOS가 하므로 서버는 레이아웃을 해석하지 않고 그대로 전달만 한다.
 * 컷 수를 코드에 하드코딩하지 않기 위해 `cutCount`를 여기서만 정의한다.
 */
export const templates = pgTable('templates', {
  id: uuid().primaryKey().defaultRandom(),
  /** 시드를 다시 돌려도 같은 행을 가리키기 위한 안정 키 */
  code: text().notNull().unique(),
  name: text().notNull(),
  cutCount: integer().notNull(),
  aspectRatio: text().notNull(),
  slots: jsonb().$type<TemplateSlot[]>().notNull(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
})

export type Template = typeof templates.$inferSelect
