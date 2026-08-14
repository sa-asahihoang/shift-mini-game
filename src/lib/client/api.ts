// src/lib/client/api.ts
import type { RecordedRound } from '@/lib/fairness'
import type { Hand, Outcome } from '@/lib/game/hands'
import type { RunStatus } from '@/lib/game/run-state'

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RunView {
  runId: string
  runCode: string
  commitment: string
  clientSeed: string
  targetWins: number
  wins: number
  nextNonce: number
}

export interface RoundView {
  nonce: number
  playerHand: Hand
  serverHand: Hand
  outcome: Outcome
  wins: number
  status: RunStatus
  targetWins: number
  serverSeed?: string
  replayed: boolean
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const code = (body as { error?: string } | null)?.error ?? 'unknown_error'
    const message = (body as { message?: string } | null)?.message ?? `HTTP ${response.status}`
    throw new ApiError(code, response.status, message)
  }
  return body as T
}

export function apiStartRun(clientSeed?: string) {
  return call<RunView & { resumed: boolean }>('/api/runs', {
    method: 'POST',
    body: JSON.stringify(clientSeed ? { clientSeed } : {}),
  })
}

export function apiPlayRound(runId: string, hand: Hand, nonce: number) {
  return call<RoundView>(`/api/runs/${runId}/rounds`, {
    method: 'POST',
    body: JSON.stringify({ hand, nonce }),
  })
}

export function apiGetRun(runId: string) {
  return call<RunView & { status: RunStatus; serverSeed?: string; rounds: RecordedRound[] }>(
    `/api/runs/${runId}`,
  )
}

export function apiAbandonRun(runId: string) {
  return call<{ status: 'abandoned'; serverSeed: string; wins: number }>(`/api/runs/${runId}/abandon`, {
    method: 'POST',
  })
}
