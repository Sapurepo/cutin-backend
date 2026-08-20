import type { NotificationSlot } from '../../db/schema/index.ts'

/**
 * 슬롯이 열리는 로컬 시각 (명세 §3.3의 예시를 확정값으로 채택).
 * 코드 어디에도 시각을 흩뿌리지 않는다 — 바꾸려면 이 표만 고친다.
 */
export const slotStartHours: Record<NotificationSlot, number> = {
  morning: 8,
  lunch: 12,
  evening: 18,
  night: 21,
}

/** 슬롯을 미선택한 사용자에게 적용하는 기본값 (명세 §3.3) */
export const defaultSlots: NotificationSlot[] = ['morning']

/** 리마인더 잡의 tick 간격. 슬롯 진입 판정 폭과 같아야 한다. */
export const REMINDER_TICK_MINUTES = 15

/**
 * 디바이스 타임존 기준으로 방금 열린 슬롯을 찾는다.
 *
 * tick이 15분마다 돌고 "로컬 시각이 슬롯 시작시각이고 분이 0~14"일 때만 열린 것으로 보므로,
 * 슬롯 하나당 로컬 하루에 정확히 한 번만 걸린다. 별도의 발송 이력 테이블이 필요 없다.
 */
export function slotOpeningAt(now: Date, timezone: string): NotificationSlot | undefined {
  const local = localHourMinute(now, timezone)
  if (local === undefined || local.minute >= REMINDER_TICK_MINUTES) return undefined

  return (Object.keys(slotStartHours) as NotificationSlot[]).find(
    (slot) => slotStartHours[slot] === local.hour,
  )
}

/** 타임존이 올바르지 않으면 undefined. 잘못된 값 하나가 잡 전체를 죽이지 않게 한다. */
function localHourMinute(
  now: Date,
  timezone: string,
): { hour: number; minute: number } | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    if (Number.isNaN(hour) || Number.isNaN(minute)) return undefined
    // 24시간 표기에서 자정이 '24'로 나오는 환경이 있어 0으로 접는다.
    return { hour: hour % 24, minute }
  } catch {
    return undefined
  }
}
