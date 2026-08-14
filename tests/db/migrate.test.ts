// tests/db/migrate.test.ts
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '@/lib/db/client'
import { runMigrations } from '@/lib/db/migrate'
import { getTestDb, getTestDbUrl, stopTestDb } from '../helpers/test-db'

/**
 * Mỗi test lấy một database TRỐNG riêng trong cùng container.
 *
 * Helper `getTestDb` luôn dựng container mới rồi migrate đúng một lần, nên nó
 * không bao giờ chạm tới lần chạy thứ hai — mà đó chính là lần deploy thứ hai
 * trên production. Muốn bắt được lỗi thì phải gọi `runMigrations` hai lần trên
 * cùng một database.
 */
const closers: Array<() => Promise<void>> = []

async function freshDatabase(name: string): Promise<Db> {
  const base = await getTestDb()
  // CREATE DATABASE không chạy được trong transaction — db.execute không bọc
  // transaction nên vẫn hợp lệ.
  await base.execute(sql.raw(`CREATE DATABASE ${name}`))

  const url = new URL(await getTestDbUrl())
  url.pathname = `/${name}`
  const handle = createDb(url.toString(), 2)
  closers.push(handle.close)
  return handle.db
}

describe('runMigrations', () => {
  afterAll(async () => {
    for (const close of closers) await close()
    await stopTestDb()
  })

  it('áp mọi file .sql trong thư mục, kể cả file không có trong journal của drizzle-kit', async () => {
    const db = await freshDatabase('migrate_lan_dau')

    const applied = await runMigrations(db)

    // 0001 cố ý vắng mặt trong drizzle/meta/_journal.json — đây là lý do runner
    // này quét thư mục thay vì tin vào journal.
    expect(applied).toContain('0000_init.sql')
    expect(applied).toContain('0001_partial_indexes.sql')
  })

  it('chạy lần hai không lỗi và không áp lại file nào', async () => {
    const db = await freshDatabase('migrate_lan_hai')

    const first = await runMigrations(db)
    expect(first.length).toBeGreaterThan(0)

    // Đây là lần deploy thứ hai. Coolify chạy Pre-deployment Command mỗi lần
    // deploy, nên nếu lần này ném thì mọi bản deploy sau bản đầu tiên đều hỏng.
    const second = await runMigrations(db)
    expect(second).toEqual([])
  })

  it('áp file mới xuất hiện sau này mà không đụng tới file đã áp', async () => {
    const db = await freshDatabase('migrate_file_moi')
    await runMigrations(db)

    // Bản sao thư mục drizzle có thêm một migration mới: file cũ phải được bỏ
    // qua, file mới phải chạy. Nếu runner áp lại từ đầu thì 0000 nổ trước khi
    // tới được file mới — và migration mới không bao giờ lên được production.
    const dir = mkdtempSync(join(tmpdir(), 'janken-migrations-'))
    cpSync(join(process.cwd(), 'drizzle'), dir, { recursive: true })
    writeFileSync(join(dir, '0002_them_cot_ghi_chu.sql'), 'ALTER TABLE runs ADD COLUMN ghi_chu text;')

    try {
      const applied = await runMigrations(db, dir)
      expect(applied).toEqual(['0002_them_cot_ghi_chu.sql'])

      const rows = await db.execute<{ filename: string }>(sql`SELECT filename FROM _migrations`)
      expect(rows.map((r) => r.filename).sort()).toEqual([
        '0000_init.sql',
        '0001_partial_indexes.sql',
        '0002_them_cot_ghi_chu.sql',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
