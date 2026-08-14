// src/lib/db/migrate.ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import type { Db } from './client'

/**
 * Chạy những file .sql trong drizzle/ chưa từng được áp, theo thứ tự tên.
 *
 * Cố ý không dùng drizzle-kit migrate: nó chỉ chạy những migration có đăng ký
 * trong meta/_journal.json, nên sẽ bỏ qua các file viết tay như
 * 0001_partial_indexes.sql — và bỏ qua im lặng.
 *
 * Nhưng quét thư mục thôi thì chưa đủ: phải nhớ file nào đã áp. Lệnh migration
 * được đặt ở Pre-deployment Command của Coolify, tức là chạy lại mỗi lần deploy,
 * và `CREATE TYPE` không có dạng `IF NOT EXISTS` — bản deploy thứ hai sẽ nổ ngay
 * ở file 0000 và không bao giờ chạm tới migration mới.
 */
export async function runMigrations(db: Db, dir = join(process.cwd(), 'drizzle')): Promise<string[]> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const rows = await db.execute<{ filename: string }>(sql`SELECT filename FROM _migrations`)
  const applied = new Set(rows.map((r) => r.filename))

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const newlyApplied: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue

    // Mỗi file một transaction: áp được một nửa còn tệ hơn không áp gì.
    await db.transaction(async (tx) => {
      for (const statement of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) await tx.execute(sql.raw(trimmed))
      }
      await tx.execute(sql`INSERT INTO _migrations (filename) VALUES (${file})`)
    })
    newlyApplied.push(file)
  }

  return newlyApplied
}
