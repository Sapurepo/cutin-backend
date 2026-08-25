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
  /**
   * 장식 그림 파일 이름(`assets/frames/` 안). 색과 길이만으로는 캐릭터도 스티커도 그릴 수 없어,
   * 프레임의 "귀여움"이 색 바꾸기에서 멈춘다. 그림으로 받으면 외형을 늘릴 때 앱을 다시 배포하지
   * 않아도 된다 — 이 시드만 바뀐다.
   *
   * **URL이 아니라 파일 이름을 담는다.** 미디어의 `storageKey`와 같은 이유로, URL은 읽는 시점에
   * `PUBLIC_BASE_URL`로 만든다. 주소가 바뀌어도 기존 행이 따라온다.
   *
   * 스트립은 클라이언트가 **캔버스 폭 100%로 늘려 그리드 위/아래의 제 밴드에 놓는다**(컷 위에
   * 겹치지 않는다). 밴드 높이는 그림의 비율이 정하므로 여기에 값이 없다 — 템플릿 비율이 달라져도
   * 장식이 늘어나지 않는다.
   */
  decorTopAsset: text(),
  decorBottomAsset: text(),
  /** 배경 위에 까는 타일 */
  patternAsset: text(),
  /** 타일 폭 ÷ 캔버스 폭. `patternAsset`이 있을 때만 의미가 있다. */
  patternScale: doublePrecision(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
})

export type Frame = typeof frames.$inferSelect
