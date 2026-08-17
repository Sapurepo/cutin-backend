import type { Database } from './client.ts'
import { type TemplateSlot, templates } from './schema/index.ts'

/** 격자 레이아웃을 0~1 비율 좌표로 편다. 왼쪽 위부터 행 우선으로 채운다. */
function grid(columns: number, rows: number): TemplateSlot[] {
  const slots: TemplateSlot[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      slots.push({
        x: column / columns,
        y: row / rows,
        width: 1 / columns,
        height: 1 / rows,
      })
    }
  }
  return slots
}

/**
 * 격자로 떨어지지 않는 레이아웃은 `slots`를 직접 적는다.
 * `slots`가 자유 사각형이라 스키마를 바꾸지 않고도 표현된다.
 */
type TemplateSeed = { code: string; name: string; aspectRatio: string } & (
  | { columns: number; rows: number }
  | { slots: TemplateSlot[] }
)

/** `1.6 : 1`로 가로를 나눈 값. 왼쪽 큰 컷의 폭이다. */
const BIG_LEFT_WIDTH = 1.6 / 2.6
const BIG_RIGHT_WIDTH = 1 / 2.6

/**
 * 명세 §5.1의 컷 수(1·2·4·6)를 템플릿으로만 표현한다.
 * 컷 수나 레이아웃을 바꾸려면 코드가 아니라 이 목록만 손대면 된다.
 *
 * `aspectRatio`와 `slots`는 **컷 그리드 영역 기준**이다 —
 * 프레임 여백(padding·gutter)과 푸터는 포함하지 않는다.
 */
const seeds: TemplateSeed[] = [
  { code: 'single', name: '한 컷', columns: 1, rows: 1, aspectRatio: '3:4' },
  { code: 'strip2', name: '두 컷 세로', columns: 1, rows: 2, aspectRatio: '1:2' },
  { code: 'pair2', name: '두 컷 가로', columns: 2, rows: 1, aspectRatio: '2:1' },
  { code: 'grid4', name: '네 컷', columns: 2, rows: 2, aspectRatio: '1:1' },
  { code: 'strip4', name: '포토부스 스트립', columns: 1, rows: 4, aspectRatio: '1:3' },
  { code: 'strip4wide', name: '와이드 스트립', columns: 4, rows: 1, aspectRatio: '3:1' },
  {
    code: 'bigLeft',
    name: '빅 레프트',
    aspectRatio: '1:1',
    slots: [
      { x: 0, y: 0, width: BIG_LEFT_WIDTH, height: 1 },
      { x: BIG_LEFT_WIDTH, y: 0, width: BIG_RIGHT_WIDTH, height: 1 / 3 },
      { x: BIG_LEFT_WIDTH, y: 1 / 3, width: BIG_RIGHT_WIDTH, height: 1 / 3 },
      { x: BIG_LEFT_WIDTH, y: 2 / 3, width: BIG_RIGHT_WIDTH, height: 1 / 3 },
    ],
  },
  { code: 'grid6', name: '여섯 컷', columns: 2, rows: 3, aspectRatio: '2:3' },
]

export async function seedTemplates(db: Database): Promise<void> {
  for (const [index, seed] of seeds.entries()) {
    const slots = 'slots' in seed ? seed.slots : grid(seed.columns, seed.rows)
    const values = {
      code: seed.code,
      name: seed.name,
      // 격자든 명시든 컷 수는 자리 개수와 같다.
      cutCount: slots.length,
      aspectRatio: seed.aspectRatio,
      slots,
      sortOrder: index,
      isActive: true,
    }
    await db.insert(templates).values(values).onConflictDoUpdate({
      target: templates.code,
      set: values,
    })
  }
}
