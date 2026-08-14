// src/lib/repo/stats.ts
import { sql } from 'drizzle-orm'
import type { Tx } from './players'

export interface GameStats {
  totalRounds: number
  decidedRounds: number
  playerWins: number
  /** null khi chưa có ván nào có phân định. */
  winRate: number | null
  totalRuns: number
  longestStreak: number
}

export async function loadGameStats(tx: Tx): Promise<GameStats> {
  const roundRows = await tx.execute<{ total: string; decided: string; wins: string }>(sql`
    SELECT
      count(*)                                        AS total,
      count(*) FILTER (WHERE outcome <> 'draw')       AS decided,
      count(*) FILTER (WHERE outcome = 'win')         AS wins
    FROM rounds
  `)

  const runRows = await tx.execute<{ total: string; longest: string | null }>(sql`
    SELECT count(*) AS total, max(wins) AS longest FROM runs
  `)

  const rounds = roundRows[0] ?? { total: '0', decided: '0', wins: '0' }
  const runs = runRows[0] ?? { total: '0', longest: null }

  const decidedRounds = Number(rounds.decided)
  const playerWins = Number(rounds.wins)

  return {
    totalRounds: Number(rounds.total),
    decidedRounds,
    playerWins,
    winRate: decidedRounds === 0 ? null : playerWins / decidedRounds,
    totalRuns: Number(runs.total),
    longestStreak: Number(runs.longest ?? 0),
  }
}
