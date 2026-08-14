// src/components/game/CommitmentPanel.tsx
'use client'

import type { RecordedRound } from '@/lib/fairness'

interface Props {
  commitment: string
  clientSeed: string
  runCode: string
  serverSeed?: string
  rounds?: RecordedRound[]
}

/** Trên ngưỡng này thì bỏ danh sách ván khỏi URL, tránh proxy cắt cụt query string. */
const MAX_ROUNDS_PARAM_LENGTH = 6000

/**
 * Dải dữ liệu cam kết dưới màn chơi.
 *
 * Cố ý KHÔNG có câu giải thích nào — màn chơi chỉ chứa thứ để chơi, phần vì sao
 * thì `/how-it-works` lo. Nhưng cam kết vẫn phải HIỆN RA trước cú bấm đầu tiên:
 * đó là toàn bộ lời hứa của sản phẩm, và một người chơi nghi ngờ cần chụp lại
 * được nó trước khi đánh ván nào. Giấu sau nút gạt là mất đúng điều đó.
 */
export function CommitmentPanel({ commitment, clientSeed, runCode, serverSeed, rounds }: Props) {
  const roundsParam = rounds?.length ? JSON.stringify(rounds) : ''
  const encodedRounds = roundsParam ? encodeURIComponent(roundsParam) : ''
  const roundsFitInUrl = encodedRounds.length > 0 && encodedRounds.length <= MAX_ROUNDS_PARAM_LENGTH
  const roundsOmitted = encodedRounds.length > MAX_ROUNDS_PARAM_LENGTH
  const verifyHref =
    `/verify?serverSeed=${serverSeed}&clientSeed=${encodeURIComponent(clientSeed)}` +
    `&commitment=${commitment}` +
    (roundsFitInUrl ? `&rounds=${encodedRounds}` : '')

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <dl className="space-y-1.5 font-mono text-[11px] leading-relaxed text-slate-500">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Run</dt>
          <dd className="break-all text-slate-700">{runCode}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Commitment</dt>
          <dd className="break-all text-slate-700">{commitment}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Your seed</dt>
          <dd className="break-all text-slate-700">{clientSeed}</dd>
        </div>
        {serverSeed && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0">Server seed</dt>
            <dd className="break-all text-slate-700">{serverSeed}</dd>
          </div>
        )}
      </dl>

      {serverSeed && (
        <div className="space-y-2">
          <a
            className="inline-block rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
            href={verifyHref}
          >
            Verify this run
          </a>

          {/*
            Vượt ngưỡng thì link chỉ đối chiếu được cam kết, không dựng lại từng
            ván. Im lặng ở đây là tệ nhất: người chơi thấy chữ MATCH và tưởng đã
            kiểm xong, trong khi phần đáng xem nhất còn chưa chạy. Nói thẳng ra,
            và đưa luôn dữ liệu để họ tự dán.
          */}
          {roundsOmitted && (
            <details className="text-xs text-slate-600">
              {/*
                Dòng nhìn thấy được phải nói HẬU QUẢ, không phải nguyên nhân kỹ
                thuật: thứ người chơi cần biết là phần kiểm từng ván chưa chạy,
                chứ không phải chuyện độ dài đường dẫn.
              */}
              <summary className="cursor-pointer">
                That link does NOT re-check your rounds — tap for the data
              </summary>
              <p className="mt-2">
                This run is too long to fit its rounds in the link, so the link only checks the
                commitment. Copy the block below into the &ldquo;Rounds&rdquo; field on the verify
                page to replay every hand.
              </p>
              <textarea
                className="mt-2 h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs"
                readOnly
                value={roundsParam}
              />
            </details>
          )}
        </div>
      )}
    </section>
  )
}
