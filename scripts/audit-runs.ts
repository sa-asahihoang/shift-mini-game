// scripts/audit-runs.ts
import { createDb } from '@/lib/db/client'
import { logger } from '@/lib/observability/logger'
import { sweepFinishedRuns } from '@/lib/services/audit-sweep'

const LOOKBACK_HOURS = Number(process.env.AUDIT_LOOKBACK_HOURS ?? 48)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')

  const { db, close } = createDb(url, 4)
  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000)
    const report = await sweepFinishedRuns(db, since)

    logger.info({ ...report, since: since.toISOString() }, 'quét đối chiếu xong')

    if (report.truncated) {
      logger.warn(
        { scanned: report.scanned },
        'quét bị cắt bớt — nâng giới hạn hoặc rút ngắn cửa sổ, nếu không phần còn lại không ai kiểm',
      )
    }

    if (report.mismatched.length > 0) {
      logger.error({ mismatched: report.mismatched }, 'CÓ LƯỢT KHÔNG KHỚP — cần điều tra ngay')
      process.exitCode = 1
    }
  } finally {
    await close()
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'quét đối chiếu thất bại')
  process.exit(1)
})
