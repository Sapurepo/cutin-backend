import { boolean, doublePrecision, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'

/** 하단 스탬프 종류. 로고 문자열과 서체는 클라이언트 자산이라 서버는 켜고 끄는 것만 안다. */
export const frameFooters = ['logoDate'] as const
export type FrameFooter = (typeof frameFooters)[number]

/**
 * 컷 그리드를 감싸는 외형. 템플릿과 분리한 이유는 조합이 곱해지기 때문이다
 * (템플릿 8종 × 프레임 8종 = 64종을 템플릿 필드로 표현할 수 없다).
 *
 * 프레임 색은 UI 테마가 아니라 **콘텐츠**다 — 합성본은 한 번 구워지면 파일로 남으므로
 * 사용자가 라이트/다크를 바꿔도 같은 그림이어야 한다.
 *
 * 길이 값은 전부 **캔버스 폭 대비 비율**이다. px으로 주면 어느 폭 기준인지가 계약에서 빠진다.
 * `numeric`이 아니라 `doublePrecision`을 쓰는 이유는 postgres.js가 numeric을 문자열로
 * 돌려주어 JSON 계약이 string이 되기 때문이다.
 */
export const frames = pgTable('frames', {
  id: uuid().primaryKey().defaultRandom(),
  /** 시드를 다시 돌려도 같은 행을 가리키기 위한 안정 키 */
  code: text().notNull().unique(),
  name: text().notNull(),
  /** `#RRGGBB` — 프레임 배경 */
  background: text().notNull(),
  /** `#RRGGBB` — 푸터 스탬프·빈 슬롯 표시 */
  foreground: text().notNull(),
  padding: doublePrecision().notNull(),
  gutter: doublePrecision().notNull(),
  cellRadius: doublePrecision().notNull(),
  footer: text({ enum: frameFooters }),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
})

export type Frame = typeof frames.$inferSelect
