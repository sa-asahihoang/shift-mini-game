// tests/helpers/test-db.ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/client'
import { runMigrations } from '@/lib/db/migrate'

let container: StartedPostgreSqlContainer | undefined
let handle: { db: Db; close: () => Promise<void> } | undefined

/** Khởi động Postgres một lần cho cả file test, chạy migration, trả về db. */
export async function getTestDb(): Promise<Db> {
  if (!handle) {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    handle = createDb(container.getConnectionUri(), 20)
    await runMigrations(handle.db)
  }
  return handle.db
}

/**
 * Chuỗi kết nối tới Postgres của test.
 * Test API cần giá trị này để đặt DATABASE_URL trước khi import route —
 * getDb() đọc biến môi trường ở lần gọi đầu tiên.
 */
export async function getTestDbUrl(): Promise<string> {
  await getTestDb()
  if (!container) throw new Error('container test chưa khởi động')
  return container.getConnectionUri()
}

/** Dọn sạch dữ liệu giữa các test, giữ nguyên lược đồ. */
export async function resetTestDb(db: Db) {
  await db.execute(sql`TRUNCATE audit_events, rounds, runs, players RESTART IDENTITY CASCADE`)
}

export async function stopTestDb() {
  await handle?.close()
  await container?.stop()
  handle = undefined
  container = undefined
}
