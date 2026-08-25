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
  decorTopAsset?: string
  decorBottomAsset?: string
  patternAsset?: string
  patternScale?: number
}

/** iOS 0.1.0이 360pt 설계 폭 기준 px으로 갖고 있던 값을 폭으로 나눈 것이다. */
const DESIGN_WIDTH = 360
const ratio = (px: number): number => px / DESIGN_WIDTH

/**
 * **여백의 하한.** 이보다 얇으면 테두리가 테두리로 읽히지 않는다 — `basic`이 `ratio(4)`였을 때
 * 실기기에서 "사진이 프레임과 겹쳐 보인다"는 말이 나왔다(2026-08-25). 세로로 긴 배치
 * (포토부스 스트립)는 화면에서 높이에 맞춰 축소되어 여백이 더 얇아 보이므로 여유가 필요하다.
 *
 * 새 프레임의 `padding`은 이 값 이상으로 둔다.
 */
const MIN_PADDING = ratio(8)

/** `basic`을 뺀 나머지는 여백·라운딩이 같아 한곳에 둔다. */
const standard = {
  padding: ratio(12),
  gutter: ratio(8),
  cellRadius: ratio(2),
  footer: 'logoDate' as const,
}

/**
 * 장식이 있는 프레임.
 *
 * **여백은 `standard`를 그대로 쓴다.** 장식 프레임의 사진이 단색 프레임보다 좁으면, 같은 컷을
 * 찍어도 프레임을 바꾸는 순간 사진 크기가 달라진다(사용자 피드백 2026-08-25). 값을 베껴 적지 않고
 * 펴서 쓰는 이유가 이것이다 — 한쪽만 고치면 다시 갈린다.
 *
 * **거터와 라운딩만 0으로 덮는다.** 포토부스 인화물처럼 컷이 서로 맞닿아 하나의 사각형이 되고, 그
 * 사각형의 모서리가 프레임과 딱 맞물린다. 틈과 둥근 모서리가 있으면 컷이 프레임 위에 어중간하게
 * 얹힌 것처럼 보인다(포토매틱 스트립 참조).
 *
 * 장식 그림은 컷 위가 아니라 **위아래 밴드**에 놓인다. 밴드 높이는 그림의 비율이 정하므로
 * 여기 값이 아니다 — 클라이언트 `CutCompositor`가 캔버스를 그만큼 늘린다.
 * 그림은 `assets/frames/`에 있고 `Scripts/frames/renderDecor.swift`(cutin-ios)가 굽는다.
 */
const decorated = {
  ...standard,
  gutter: 0,
  cellRadius: 0,
}

/** 장식 타일은 폭 1080 캔버스에 180px로 그려져 있다. */
const tileScale = 180 / 1080

/**
 * 외형을 바꾸거나 늘리려면 이 목록만 손대면 된다.
 * 배열 순서가 그대로 노출 순서(`sortOrder`)가 된다.
 *
 * **첫 항목이 기본 외형이다.** 클라이언트는 포스트의 `frame`이 null일 때 이것으로 그리므로,
 * 앞에 새 프레임을 끼워 넣으면 외형을 고르지 않은 기존 포스트가 전부 달라 보인다.
 * 새 외형은 뒤에 붙인다.
 */
const seeds: FrameSeed[] = [
  {
    code: 'basic',
    name: '베이직',
    background: '#1E1E21',
    foreground: '#F5F5F4',
    /* 여백은 `standard`와 같다 — 프레임을 바꿔도 사진 크기가 그대로여야 한다.
     * `basic`을 가르는 것은 어두운 배경과 **스탬프 없음**뿐이다. */
    ...standard,
    cellRadius: 0,
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
  {
    code: 'heart',
    name: '하트',
    background: '#FFE7EF',
    foreground: '#C2436B',
    ...decorated,
    decorTopAsset: 'heart-top.png',
    decorBottomAsset: 'heart-bottom.png',
    patternAsset: 'heart-pattern.png',
    patternScale: tileScale,
  },
  {
    code: 'sparkle',
    name: '반짝',
    background: '#F3EAFF',
    foreground: '#5B3E96',
    ...decorated,
    decorTopAsset: 'sparkle-top.png',
    decorBottomAsset: 'sparkle-bottom.png',
  },
  {
    code: 'cloud',
    name: '구름',
    background: '#DDEEFF',
    foreground: '#2F5D8C',
    ...decorated,
    decorTopAsset: 'cloud-top.png',
    decorBottomAsset: 'cloud-bottom.png',
  },
  {
    code: 'daisy',
    name: '데이지',
    background: '#EDF6E3',
    foreground: '#3F6B39',
    ...decorated,
    decorTopAsset: 'daisy-top.png',
    decorBottomAsset: 'daisy-bottom.png',
    patternAsset: 'daisy-pattern.png',
    patternScale: tileScale,
  },
  {
    code: 'bear',
    name: '곰돌이',
    background: '#F7E9D6',
    foreground: '#7A4A28',
    ...decorated,
    decorTopAsset: 'bear-top.png',
    decorBottomAsset: 'bear-bottom.png',
  },
  {
    code: 'ribbon',
    name: '리본',
    background: '#FFF1F3',
    foreground: '#A03A54',
    ...decorated,
    decorTopAsset: 'ribbon-top.png',
    decorBottomAsset: 'ribbon-bottom.png',
    patternAsset: 'ribbon-pattern.png',
    patternScale: tileScale,
  },
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
