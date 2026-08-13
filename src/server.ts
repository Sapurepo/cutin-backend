import { buildApp } from './app.ts'
import { env } from './config/env.ts'
import { createDatabase } from './db/client.ts'

const database = createDatabase(env.DATABASE_URL)
const app = await buildApp({ db: database.db })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      app.log.info(`${signal} 수신, 종료합니다.`)
      await app.close()
      await database.close()
      process.exit(0)
    })()
  })
}

await app.listen({ host: env.HOST, port: env.PORT })
