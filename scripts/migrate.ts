// scripts/migrate.ts
import { createDb } from '@/lib/db/client'
import { runMigrations } from '@/lib/db/migrate'
import { logger } from '@/lib/observability/logger'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')

  const { db, close } = createDb(url, 2)
  try {
    const applied = await runMigrations(db)
    logger.info({ applied }, 'chạy migration xong')
  } finally {
    await close()
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'chạy migration thất bại')
  process.exit(1)
})
