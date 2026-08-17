import { Inject, Injectable, Logger } from '@nestjs/common'
import { DevicesRepository } from '../modules/devices/devicesRepository.ts'
import { defaultSlots, slotOpeningAt } from '../modules/notifications/slotSchedule.ts'
import { PUSH } from '../shared/push/pushModule.ts'
import type { PushMessage, PushService } from '../shared/push/pushService.ts'

const REMINDER_TITLE = 'CUTIN'
const REMINDER_BODY = '오늘의 한 컷을 남겨볼까요?'

/**
 * 슬롯 리마인더. 15분마다 돌면서 **디바이스 타임존 기준으로** 방금 열린 슬롯이
 * 사용자가 고른 슬롯인 디바이스에만 보낸다.
 *
 * `now`를 인자로 받는 이유는 타임존이 다른 사용자들을 시각을 주입해 시험하기 위해서다.
 * 스케줄러는 `new Date()`를 넣는다.
 */
@Injectable()
export class ReminderJob {
  private readonly logger = new Logger(ReminderJob.name)

  constructor(
    private readonly devices: DevicesRepository,
    @Inject(PUSH) private readonly push: PushService,
  ) {}

  async run(now: Date): Promise<{ sent: number }> {
    const targets = await this.devices.listReminderTargets()

    const messages: PushMessage[] = []
    for (const target of targets) {
      const opening = slotOpeningAt(now, target.timezone)
      if (opening === undefined) continue

      const slots = target.slots ?? defaultSlots
      if (!slots.includes(opening)) continue

      messages.push({
        pushToken: target.pushToken,
        pushEnvironment: target.pushEnvironment,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        data: { slot: opening },
      })
    }

    if (messages.length === 0) return { sent: 0 }

    const result = await this.push.send(messages)
    await this.devices.revokeTokens(result.invalidTokens)
    this.logger.log(`슬롯 리마인더 ${result.sent}건 발송`)
    return { sent: result.sent }
  }
}
