// src/lib/db/client.ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

export function createDb(connectionString: string, max = 10) {
  const sql = postgres(connectionString, { max })
  return { db: drizzle(sql, { schema }), close: () => sql.end() }
}

let shared: { db: Db; close: () => Promise<void> } | undefined

/** Kết nối dùng chung cho runtime của app. Test luôn tự tạo kết nối riêng. */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')
    shared = createDb(url)
  }
  return shared.db
}
