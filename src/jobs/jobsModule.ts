import {
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common'
import { PgBoss } from 'pg-boss'
import { env } from '../config/env.ts'
import { DevicesModule } from '../modules/devices/devicesModule.ts'
import { REMINDER_TICK_MINUTES } from '../modules/notifications/slotSchedule.ts'
import { ReminderJob } from './reminderJob.ts'
import { RetentionJob } from './retentionJob.ts'

const QUEUES = {
  reminder: 'slot-reminder',
  draftExpiry: 'draft-expiry',
  purge: 'retention-purge',
} as const

/**
 * pg-boss는 Postgres만으로 큐를 운영한다 — Redis를 더 붙이지 않으려는 선택이다.
 * 자기 스키마(`pgboss`)를 직접 만들므로 drizzle 마이그레이션과 섞이지 않는다.
 *
 * 잡 본체는 `ReminderJob`·`RetentionJob`이고 여기서는 스케줄만 건다.
 * 그 둘은 `now`를 인자로 받으므로 테스트는 이 모듈을 띄우지 않고 직접 호출한다.
 */
@Injectable()
export class JobScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobScheduler.name)
  private boss?: PgBoss

  constructor(
    private readonly reminder: ReminderJob,
    private readonly retention: RetentionJob,
  ) {}

  async onModuleInit(): Promise<void> {
    // 테스트는 잡을 직접 호출한다. 여기서 큐를 띄우면 컨테이너마다 스키마가 생긴다.
    if (env.NODE_ENV === 'test') return

    const boss = new PgBoss(env.DATABASE_URL)
    boss.on('error', (error: unknown) => this.logger.error('pg-boss 오류', error))
    await boss.start()
    this.boss = boss

    await this.register(boss, QUEUES.reminder, `*/${REMINDER_TICK_MINUTES} * * * *`, () =>
      this.reminder.run(new Date()),
    )
    await this.register(boss, QUEUES.draftExpiry, '0 * * * *', () =>
      this.retention.expireDrafts(new Date()),
    )
    await this.register(boss, QUEUES.purge, '30 4 * * *', () => this.retention.purge(new Date()))

    this.logger.log('잡 스케줄러 시작')
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop()
  }

  private async register(
    boss: PgBoss,
    queue: string,
    cron: string,
    handler: () => Promise<unknown>,
  ): Promise<void> {
    await boss.createQueue(queue)
    await boss.work(queue, async () => {
      await handler()
    })
    // 같은 이름으로 다시 걸면 갱신된다. 배포마다 중복 예약이 쌓이지 않는다.
    await boss.schedule(queue, cron)
  }
}

@Module({
  imports: [DevicesModule],
  providers: [JobScheduler, ReminderJob, RetentionJob],
  // 테스트가 잡을 직접 돌린다.
  exports: [ReminderJob, RetentionJob],
})
export class JobsModule {}
