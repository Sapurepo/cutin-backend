import { defineConfig } from 'drizzle-kit'
import { env } from './src/config/env.ts'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './src/db/migrations',
  dbCredentials: { url: env.DATABASE_URL },
  casing: 'snake_case',
})
