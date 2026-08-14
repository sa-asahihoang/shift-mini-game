// src/app/stats/page.tsx
import { getDb } from '@/lib/db/client'
import { loadGameStats } from '@/lib/repo/stats'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const stats = await loadGameStats(getDb())
  const formatter = new Intl.NumberFormat('en-US')

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Public stats</h1>
        <p className="text-slate-600">
          Across decided rounds the win rate should converge on 50%. That number is the statistical
          evidence that the rules favour neither side.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-slate-500">Total rounds</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.totalRounds)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Decided rounds</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.decidedRounds)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Player win rate</dt>
          <dd className="text-2xl font-semibold">
            {stats.winRate === null ? '—' : `${(stats.winRate * 100).toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Longest streak reached</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.longestStreak)}</dd>
        </div>
      </dl>

      <p className="text-sm text-slate-500">
        {formatter.format(stats.totalRuns)} runs played.
      </p>
    </main>
  )
}
