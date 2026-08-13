import type { Database } from './client.ts'
import { type FrameFooter, frames } from './schema/index.ts'

interface FrameSeed {
  code: string
  name: string
  background: string
  foreground: string
  padding: number
  gutter: number
  cellRadius: number
  footer: FrameFooter | null
}

/** iOS 0.1.0이 360pt 설계 폭 기준 px으로 갖고 있던 값을 폭으로 나눈 것이다. */
const DESIGN_WIDTH = 360
const ratio = (px: number): number => px / DESIGN_WIDTH

/** `basic`을 뺀 나머지는 여백·라운딩이 같아 한곳에 둔다. */
const standard = {
  padding: ratio(12),
  gutter: ratio(8),
  cellRadius: ratio(2),
  footer: 'logoDate' as const,
}

/**
 * 외형을 바꾸거나 늘리려면 이 목록만 손대면 된다.
 * 배열 순서가 그대로 노출 순서(`sortOrder`)가 된다.
 */
const seeds: FrameSeed[] = [
  {
    code: 'basic',
    name: '베이직',
    background: '#1E1E21',
    foreground: '#F5F5F4',
    padding: ratio(4),
    gutter: ratio(4),
    cellRadius: ratio(3),
    footer: null,
  },
  {
    code: 'white',
    name: '클래식 화이트',
    background: '#FFFFFF',
    foreground: '#0A0A0B',
    ...standard,
  },
  { code: 'noir', name: '느와르 필름', background: '#111113', foreground: '#F5F5F4', ...standard },
  { code: 'peach', name: '피치', background: '#FFD9CF', foreground: '#8A3B2C', ...standard },
  { code: 'butter', name: '버터', background: '#FFE9A8', foreground: '#7A5B12', ...standard },
  { code: 'lavender', name: '라벤더', background: '#E3D9FF', foreground: '#4A3B7A', ...standard },
  { code: 'mint', name: '민트', background: '#CFEDDF', foreground: '#1F5C42', ...standard },
  { code: 'cherry', name: '체리', background: '#C6373F', foreground: '#FFFFFF', ...standard },
]

export async function seedFrames(db: Database): Promise<void> {
  for (const [index, seed] of seeds.entries()) {
    const values = { ...seed, sortOrder: index, isActive: true }
    await db.insert(frames).values(values).onConflictDoUpdate({
      target: frames.code,
      set: values,
    })
  }
}
