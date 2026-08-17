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
 *
 * **`aspectRatio`와 `slots`는 컷 그리드 영역 기준이다** — 프레임의 여백(padding·gutter)과
 * 푸터를 포함하지 않는다. 최종 캔버스 비율은 `템플릿 × 프레임`의 함수라 템플릿만의 속성이
 * 될 수 없어서, 클라이언트가 그리드 비율에 프레임 값을 더해 유도한다.
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
