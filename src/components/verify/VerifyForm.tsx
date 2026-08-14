'use client'

import { useState } from 'react'
import { commit, verifyRun, type VerifyResult } from '@/lib/fairness'
import { parseRoundsInput } from '@/lib/verify/parse-rounds'
import { HAND_NAMES } from '@/lib/game/hands'

interface Props {
  initialServerSeed?: string
  initialClientSeed?: string
  initialCommitment?: string
  initialRounds?: string
}

export function VerifyForm({ initialServerSeed, initialClientSeed, initialCommitment, initialRounds }: Props) {
  const [serverSeed, setServerSeed] = useState(initialServerSeed ?? '')
  const [clientSeed, setClientSeed] = useState(initialClientSeed ?? '')
  const [commitment, setCommitment] = useState(initialCommitment ?? '')
  const [roundsRaw, setRoundsRaw] = useState(initialRounds ?? '')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    try {
      setResult(verifyRun({ serverSeed, clientSeed, commitment, rounds: parseRoundsInput(roundsRaw) }))
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : 'could not verify')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        This page computes everything on your device and sends nothing to any server. Open your
        browser&rsquo;s Network tab and see for yourself — tapping Verify makes no request at all.
      </p>

      {[
        { label: 'Server seed', value: serverSeed, set: setServerSeed },
        { label: 'Your seed', value: clientSeed, set: setClientSeed },
        { label: 'Commitment published up front', value: commitment, set: setCommitment },
      ].map((field) => (
        <label key={field.label} className="block text-sm">
          <span className="mb-1 block">{field.label}</span>
          <input
            className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
            value={field.value}
            onChange={(event) => field.set(event.target.value)}
          />
        </label>
      ))}

      <label className="block text-sm">
        <span className="mb-1 block">Rounds (JSON, optional)</span>
        <textarea
          className="h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          value={roundsRaw}
          onChange={(event) => setRoundsRaw(event.target.value)}
          placeholder='[{"nonce":0,"playerHand":1,"serverHand":0,"outcome":"win"}]'
        />
      </label>

      <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={run}>
        Verify
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-3 rounded border border-slate-300 p-4">
          <p>
            Commitment:{' '}
            <strong className={result.commitmentValid ? 'text-green-700' : 'text-red-700'}>
              {result.commitmentValid ? 'MATCH' : 'NO MATCH'}
            </strong>
          </p>
          <p className="font-mono text-xs break-all">SHA-256(server seed) = {commit(serverSeed)}</p>

          {result.rounds.length > 0 && (
            <>
              <p>
                Rounds:{' '}
                <strong className={result.allRoundsMatch ? 'text-green-700' : 'text-red-700'}>
                  {result.allRoundsMatch ? 'ALL MATCH' : 'SOME DO NOT MATCH'}
                </strong>
              </p>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>You</th>
                    <th>Machine (recorded)</th>
                    <th>Machine (replayed)</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rounds.map((round) => (
                    <tr key={round.nonce} className={round.matches ? '' : 'bg-red-100'}>
                      <td>{round.nonce}</td>
                      <td>{HAND_NAMES[round.playerHand]}</td>
                      <td>{HAND_NAMES[round.serverHand]}</td>
                      <td>{HAND_NAMES[round.recomputedServerHand]}</td>
                      <td>{round.matches ? 'match' : 'MISMATCH'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
