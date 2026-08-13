import { env } from '../config/env.ts'
import { createDatabase } from './client.ts'
import { seedTemplates } from './seedTemplates.ts'

const { db, close } = createDatabase(env.DATABASE_URL)

await seedTemplates(db)
await close()

console.log('시드 완료')
