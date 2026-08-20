import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.ts'

export interface DatabaseHandle {
  db: ReturnType<typeof drizzle<typeof schema>>
  close: () => Promise<void>
}

export type Database = DatabaseHandle['db']

export function createDatabase(url: string): DatabaseHandle {
  const client = postgres(url, { max: 10 })
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    close: () => client.end(),
  }
}
