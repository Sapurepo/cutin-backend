import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../config/env.ts'

// drizzle이 자기 메타 테이블을 IF NOT EXISTS로 만들면서 내는 NOTICE를 오류로 오인하지 않도록 끈다.
const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })

await migrate(drizzle(client), { migrationsFolder: 'src/db/migrations' })
await client.end()

console.log('마이그레이션 완료')
