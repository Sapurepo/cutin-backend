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
 * 명세 §5.1의 컷 수(1·2·4·6)를 템플릿으로만 표현한다.
 * 컷 수를 바꾸려면 코드가 아니라 이 목록만 손대면 된다.
 */
const seeds = [
  { code: 'single', name: '한 컷', columns: 1, rows: 1, aspectRatio: '3:4' },
  { code: 'strip2', name: '두 컷', columns: 1, rows: 2, aspectRatio: '1:2' },
  { code: 'grid4', name: '네 컷', columns: 2, rows: 2, aspectRatio: '1:1' },
  { code: 'grid6', name: '여섯 컷', columns: 2, rows: 3, aspectRatio: '2:3' },
]

export async function seedTemplates(db: Database): Promise<void> {
  for (const [index, seed] of seeds.entries()) {
    const values = {
      code: seed.code,
      name: seed.name,
      cutCount: seed.columns * seed.rows,
      aspectRatio: seed.aspectRatio,
      slots: grid(seed.columns, seed.rows),
      sortOrder: index,
      isActive: true,
    }
    await db.insert(templates).values(values).onConflictDoUpdate({
      target: templates.code,
      set: values,
    })
  }
}
