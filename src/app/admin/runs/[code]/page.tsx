import { headers } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { HAND_NAMES, type Hand } from '@/lib/game/hands'
import { assertAdmin, inspectRun } from '@/lib/services/inspect-run'

export const dynamic = 'force-dynamic'

export default async function AdminRunPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  assertAdmin((await headers()).get('x-admin-token') ?? undefined)

  const inspection = await inspectRun(getDb(), decodeURIComponent(code))
  const { run, verification, stateCheck, audit } = inspection

  // Ba câu hỏi khác nhau, và banner xanh phải trả lời được cả ba. Bỏ câu thứ ba
  // ra thì đúng khiếu nại trang này sinh ra để xử — "tôi thắng 20 ván liền mà bị
  // ghi là thua" — lại là khiếu nại nó trả lời sai.
  const allGood = verification.commitmentValid && verification.allRoundsMatch && stateCheck.matches

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Run {run.runCode}</h1>

      <p className={allGood ? 'rounded bg-green-100 p-3 text-green-900' : 'rounded bg-red-100 p-3 text-red-900'}>
        {allGood
          ? 'The whole run replays to match the record. Nothing looks wrong.'
          : 'ALERT: the replay does not match the record. Investigate now.'}
      </p>

      <ul className="space-y-1 text-sm">
        <li>
          Commitment: <strong>{verification.commitmentValid ? 'match' : 'MISMATCH'}</strong>
        </li>
        <li>
          Every round replayed from the seed:{' '}
          <strong>{verification.allRoundsMatch ? 'match' : 'MISMATCH'}</strong>
        </li>
        <li>
          Status and streak rebuilt from the round ledger:{' '}
          <strong>{stateCheck.matches ? 'match' : 'MISMATCH'}</strong>
          {!stateCheck.matches && (
            <span>
              {' '}
              — the ledger derives {stateCheck.derived.status} / {stateCheck.derived.wins} wins, the
              record stores {stateCheck.stored.status} / {stateCheck.stored.wins} wins
              {stateCheck.extraRounds && ' (rounds were written after the run had already ended)'}
            </span>
          )}
        </li>
      </ul>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd>{run.status}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Streak</dt>
          <dd>
            {run.wins} / {run.targetWins}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Commitment</dt>
          <dd className="break-all font-mono text-xs">{run.commitment}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Server seed</dt>
          <dd className="break-all font-mono text-xs">{run.serverSeed}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Client seed</dt>
          <dd className="break-all font-mono text-xs">{run.clientSeed}</dd>
        </div>
      </dl>

      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Round</th>
            <th>Player</th>
            <th>Machine (recorded)</th>
            <th>Machine (replayed)</th>
            <th>Outcome</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          {verification.rounds.map((round) => (
            <tr key={round.nonce} className={round.matches ? '' : 'bg-red-100'}>
              <td>{round.nonce}</td>
              <td>{HAND_NAMES[round.playerHand as Hand]}</td>
              <td>{HAND_NAMES[round.serverHand as Hand]}</td>
              <td>{HAND_NAMES[round.recomputedServerHand as Hand]}</td>
              <td>{round.outcome}</td>
              <td>{round.matches ? 'match' : 'MISMATCH'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h2 className="mb-2 font-semibold">Audit events</h2>
        <ul className="space-y-1 text-xs">
          {audit.map((event) => (
            <li key={event.id} className="font-mono">
              {event.createdAt.toISOString()} · {event.type} · {JSON.stringify(event.payload)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
