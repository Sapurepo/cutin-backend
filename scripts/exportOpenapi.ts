import { writeFile } from 'node:fs/promises'
import { buildApp } from '../src/app.ts'
import { env } from '../src/config/env.ts'
import { createDatabase } from '../src/db/client.ts'

// postgres.js는 지연 연결이므로 스펙 산출만으로는 DB에 접속하지 않는다.
const database = createDatabase(env.DATABASE_URL)
const app = await buildApp({ db: database.db })
await app.ready()

await writeFile('openapi.json', `${JSON.stringify(app.swagger(), null, 2)}\n`)

await app.close()
await database.close()

console.log('openapi.json 생성 완료')
