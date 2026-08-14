// src/components/game/GameBoard.tsx
'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CommitmentPanel } from './CommitmentPanel'
import { HandIcon } from './HandIcon'
import type { JankenStageHandle } from './JankenStage'
import {
  ApiError,
  apiAbandonRun,
  apiGetRun,
  apiPlayRound,
  apiStartRun,
  type RoundView,
  type RunView,
} from '@/lib/client/api'
import type { RecordedRound } from '@/lib/fairness'
import { HAND_NAMES, type Hand } from '@/lib/game/hands'
import type { RunStatus } from '@/lib/game/run-state'
import { HAND_COLORS_CSS } from '@/lib/ui/hand-art'

// Pixi chạm vào canvas và window ngay khi dựng, nên không cho nó chạy lúc render server.
const JankenStage = dynamic(() => import('./JankenStage').then((m) => m.JankenStage), {
  ssr: false,
  loading: () => <div className="mx-auto aspect-[6/5] w-full max-w-[360px]" />,
})

const HANDS: Hand[] = [0, 1, 2]

interface GameBoardProps {
  /**
   * Chỉ dùng cho màn chờ, lúc chưa có lượt nào để đọc `run.targetWins`.
   *
   * Truyền từ server xuống chứ không viết cứng: `TARGET_WINS` là biến môi trường,
   * viết cứng "20" ở đây là một hôm nào đó đổi cấu hình xong màn chờ hứa một đằng
   * còn lượt chơi ra một nẻo.
   */
  targetWins: number
}

export function GameBoard({ targetWins }: GameBoardProps) {
  const [seedInput, setSeedInput] = useState('')
  const [run, setRun] = useState<RunView | null>(null)
  const [status, setStatus] = useState<RunStatus>('active')
  const [wins, setWins] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [lastRound, setLastRound] = useState<RoundView | null>(null)
  const [serverSeed, setServerSeed] = useState<string | undefined>()
  const [rounds, setRounds] = useState<RecordedRound[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Tay người chơi vừa chọn.
   *
   * Băng cuộn giữa màn là tay MÁY, nên tay của người chơi không còn chỗ nào hiện
   * ra trong lúc chờ kết quả. Không đánh dấu thì họ bấm xong nhìn màn hình mà
   * không biết mình vừa chọn gì.
   */
  const [pickedHand, setPickedHand] = useState<Hand | null>(null)

  /**
   * Ván vừa phân thắng bại, đang chờ người chơi xác nhận.
   *
   * Thắng hay thua đều là cột mốc và đều trôi qua trong chưa tới một giây nếu
   * không chặn lại: thắng thì băng cuộn chạy tiếp, thua thì màn kết thúc thế chỗ
   * luôn phần chơi. Popup giữ lại cho tới khi người chơi tự bấm. Hoà không vào
   * đây — hoà là đánh lại, đã có nhãn ngay trên sân.
   */
  const [resultRound, setResultRound] = useState<RoundView | null>(null)

  /**
   * Vừa hoà, chưa đánh lại.
   *
   * Hoà không được chặn bằng popup — hoà là đánh lại chứ không phải cột mốc — nên
   * nó từng chỉ hiện ra ở dòng tóm tắt chữ nhỏ dưới sân, trong khi băng cuộn đã
   * quay tiếp: người chơi bấm xong thấy màn hình về y như cũ và không biết ván
   * vừa rồi có tính hay không.
   *
   * Bám vào state riêng chứ không suy từ `lastRound`: `lastRound` vẫn giữ ván hoà
   * cũ trong suốt lúc ván sau đang chạy, nên dùng nó thì nhãn không tắt lúc bấm.
   */
  const [drewLastRound, setDrewLastRound] = useState(false)
  const stageRef = useRef<JankenStageHandle | null>(null)

  /**
   * Chốt chống bấm chồng, dùng ref chứ không dùng `busy`.
   *
   * `busy` là state: hai cú bấm cách nhau vài mili giây cùng đọc được giá trị cũ
   * `false` từ closure của lần render trước, nên cả hai lọt qua và gửi hai request
   * cùng một nonce. Ref cập nhật đồng bộ ngay trong lượt sự kiện, nên cú thứ hai
   * luôn thấy đúng trạng thái. Lộ ra khi chạy ở chế độ giảm chuyển động — ván chỉ
   * còn ~120ms nên các cú bấm dồn sát nhau đủ để trúng khe hở.
   */
  const inFlight = useRef(false)

  async function start() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const started = await apiStartRun(seedInput.trim() || undefined)
      setRun(started)
      setWins(started.wins)
      setNonce(started.nextNonce)
      setStatus('active')
      setLastRound(null)
      setServerSeed(undefined)
      setRounds([])
      setPickedHand(null)
      setResultRound(null)
      setDrewLastRound(false)
      stageRef.current?.reset()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'could not reach the server')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  /**
   * Kéo lại trạng thái thật từ server.
   *
   * Cần khi response của một ván bị mất trên đường về: server đã ghi ván, nonce
   * cục bộ thì chưa tăng, nên mọi lần bấm sau đều 409 nonce_mismatch. Người chơi
   * chỉ thoát được bằng cách bấm lại đúng tay cũ — mà họ không có cách nào biết
   * điều đó — hoặc bỏ lượt và mất cả chuỗi.
   */
  async function resync(runId: string) {
    try {
      const fresh = await apiGetRun(runId)
      setWins(fresh.wins)
      setNonce(fresh.nextNonce)

      // Cùng thứ tự như play(): nạp rounds TRƯỚC khi lật status. Bỏ dòng này thì
      // đúng đường hay chạy nhất — ván kết thúc lượt mà response bị mất — công bố
      // hạt giống với rounds vẫn rỗng, nên CommitmentPanel tính cả roundsFitInUrl
      // lẫn roundsOmitted đều false: người chơi nhận một link không có ván nào và
      // KHÔNG có lời giải thích, bấm vào, thấy chữ KHỚP, rồi tin rằng mình đã
      // kiểm chứng từng tay trong khi phần đó chưa hề chạy.
      setRounds(fresh.rounds)
      setStatus(fresh.status)
      if (fresh.serverSeed) setServerSeed(fresh.serverSeed)
    } catch {
      // Đồng bộ lại cũng hỏng thì giữ nguyên lỗi đang hiện, đừng đè lên.
    }
  }

  async function play(hand: Hand) {
    if (inFlight.current || !run || status !== 'active') return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setPickedHand(hand)
    setDrewLastRound(false)

    // Cho băng cuộn chạy ngay khi bấm và để nó chạy suốt lúc chờ server trả lời.
    // Đó là toàn bộ khoảnh khắc hồi hộp của ván; sau khi có kết quả nó dừng hẳn.
    stageRef.current?.resume()

    try {
      const result = await apiPlayRound(run.runId, hand, nonce)

      // Băng cuộn dừng TRƯỚC mọi cập nhật hiển thị. Đặt sau thì dòng "bạn ra kéo,
      // máy ra búa → thua" và số ván hiện ra trong lúc băng còn đang chạy, và
      // người chơi đọc được kết quả trước khi thấy tay máy lộ ra.
      // `nonce` chỉ cần cho lần bấm sau, mà nút đang bị khoá, nên hoãn không sao.
      await stageRef.current?.playRound(result.serverHand, result.outcome)

      setLastRound(result)
      setWins(result.wins)
      setNonce(result.nonce + 1)

      // Lượt vừa kết thúc: lấy toàn bộ bản ghi ván TRƯỚC KHI công bố trạng thái
      // "đã xong" lên giao diện. Nếu setStatus/setServerSeed chạy trước thì màn
      // hình kết quả (và link kiểm chứng bên trong nó) có thể render ngay — với
      // rounds vẫn còn rỗng từ trước — trong khoảng chờ apiGetRun() thứ hai này
      // trả lời, sinh ra một link thiếu tham số rounds.
      if (result.status !== 'active') {
        const finished = await apiGetRun(run.runId).catch(() => null)
        if (finished) setRounds(finished.rounds)
      }

      setStatus(result.status)
      if (result.serverSeed) setServerSeed(result.serverSeed)

      // Thắng hay thua đều chặn lại bằng popup, kể cả ván kết thúc lượt — `closeResult`
      // mới là chỗ cho băng cuộn quay lại. Hoà thì không chặn, chỉ gắn nhãn rồi quay
      // tiếp ngay; nếu không thì ván sau bấm xong không thấy gì chuyển động.
      if (result.outcome === 'draw') {
        if (result.status === 'active') {
          setDrewLastRound(true)
          stageRef.current?.resume()
        }
      } else {
        setResultRound(result)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'could not reach the server')
      setResultRound(null)
      setDrewLastRound(false)
      await resync(run.runId)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  /**
   * Đóng popup kết quả.
   *
   * Chỉ cho băng cuộn quay lại khi lượt còn chạy. Lượt đã xong thì để nó đỗ
   * nguyên trên tay máy vừa ra — cho quay tiếp sau màn kết thúc là xoá mất bằng
   * chứng cuối cùng của ván quyết định.
   */
  function closeResult() {
    const round = resultRound
    setResultRound(null)
    if (round?.status === 'active') stageRef.current?.resume()
  }

  async function abandon() {
    if (inFlight.current || !run || status !== 'active') return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await apiAbandonRun(run.runId)

      // Cùng lý do như trong play(): lấy rounds trước khi lật status/serverSeed
      // sang trạng thái đã xong, để link kiểm chứng không bao giờ render thiếu.
      const finished = await apiGetRun(run.runId).catch(() => null)
      if (finished) setRounds(finished.rounds)

      setStatus('abandoned')
      setServerSeed(result.serverSeed)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'could not reach the server')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (!run) {
    return (
      <div className="mx-auto max-w-sm space-y-5 px-1">
        <SpeechBubble title="Ready?" subtitle={`Win ${targetWins} rounds in a row`} />

        {/*
          Ô hạt giống không kèm câu giải thích nào — màn chơi chỉ chứa thứ để chơi.
          Vì sao nó quan trọng thì trang /how-it-works nói, và có link ngay đầu trang.
        */}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your seed (optional)</span>
          <input
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-sm"
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            maxLength={128}
            placeholder="type anything"
          />
        </label>

        <button
          className="w-full rounded-full bg-slate-900 px-4 py-4 text-lg font-bold text-white active:scale-95 disabled:opacity-50"
          onClick={start}
          disabled={busy}
        >
          Start run
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  const finished = status !== 'active'

  return (
    <div className="mx-auto max-w-sm space-y-4 px-1">
      <SpeechBubble
        title={finished ? 'Run over' : `Round ${nonce + 1}`}
        subtitle={
          finished
            ? status === 'won'
              ? `You won all ${run.targetWins}!`
              : status === 'lost'
                ? `Streak broken at round ${wins + 1}`
                : 'Run closed'
            : `Streak ${wins}/${run.targetWins}`
        }
      />

      <StreakBar wins={wins} target={run.targetWins} />

      <div className="relative">
        <JankenStage ref={stageRef} />

        {/*
          Luôn dựng sẵn rồi bật/tắt bằng opacity, không render có điều kiện: phần
          tử vừa gắn vào DOM thì transition không chạy, nên cách kia cho nhãn hiện
          đánh bụp một cái đúng vào lúc cần nó mềm.

          aria-hidden vì dòng tóm tắt ngay dưới đã có aria-live và đã đọc đủ kết
          quả; thêm một vùng sống thứ hai chỉ làm trình đọc màn hình nói hai lần.
        */}
        <div
          aria-hidden="true"
          // Trạng thái phơi ra thành thuộc tính vì nó không đọc được từ ngoài bằng
          // cách nào khác: phần tử luôn nằm trong DOM và chỉ mờ đi, mà `opacity: 0`
          // thì Playwright vẫn tính là visible — một phép kiểm bằng toBeVisible()
          // sẽ xanh kể cả khi nhãn không bao giờ hiện ra.
          data-shown={drewLastRound ? 'true' : 'false'}
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center transition duration-200 ${
            drewLastRound ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
        >
          <span className="rounded-full bg-slate-900 px-5 py-2 text-base font-bold text-white shadow-lg">
            Draw — play again
          </span>
        </div>
      </div>

      {lastRound && (
        <p className="text-center text-sm text-slate-600" aria-live="polite">
          You played <strong>{HAND_NAMES[lastRound.playerHand]}</strong>, machine played{' '}
          <strong>{HAND_NAMES[lastRound.serverHand]}</strong> —{' '}
          <strong>
            {lastRound.outcome === 'win' ? 'you win' : lastRound.outcome === 'draw' ? 'draw' : 'you lose'}
          </strong>
        </p>
      )}

      {status === 'active' ? (
        <div className="space-y-4">
          <div className="flex justify-center gap-5">
            {HANDS.map((hand) => (
              <button
                key={hand}
                aria-label={HAND_NAMES[hand]}
                className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition active:scale-90 disabled:opacity-40 ${
                  pickedHand === hand ? 'ring-4 ring-slate-900 ring-offset-2' : ''
                }`}
                style={{ backgroundColor: HAND_COLORS_CSS[hand] }}
                onClick={() => play(hand)}
                disabled={busy}
              >
                <HandIcon hand={hand} className="h-11 w-11" />
              </button>
            ))}
          </div>

          {/* Bỏ lượt công bố seed ngay, nên người chơi vẫn kiểm chứng được phần đã đánh. */}
          <button
            className="mx-auto block text-sm text-slate-500 underline"
            onClick={abandon}
            disabled={busy}
          >
            Give up
          </button>
        </div>
      ) : (
        <button
          className="w-full rounded-full bg-slate-900 px-4 py-4 text-lg font-bold text-white active:scale-95 disabled:opacity-50"
          onClick={start}
          disabled={busy}
        >
          New run
        </button>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <CommitmentPanel
        commitment={run.commitment}
        clientSeed={run.clientSeed}
        runCode={run.runCode}
        serverSeed={serverSeed}
        rounds={rounds}
      />

      {resultRound && (
        <ResultDialog round={resultRound} target={run.targetWins} onClose={closeResult} />
      )}
    </div>
  )
}

/**
 * Popup xác nhận một ván có phân thắng bại.
 *
 * Thắng và thua đều chặn lại như nhau. Thua mà không chặn thì băng cuộn dừng
 * xong là màn kết thúc thế chỗ luôn phần chơi: người chơi thấy giao diện đổi hẳn
 * mà chưa kịp đọc mình vừa thua bằng tay nào. Hoà thì không chặn — hoà là đánh
 * lại, đã có nhãn ngay trên sân.
 *
 * Vẽ lại cả hai tay ngay trong popup chứ không chỉ ghi tên: popup nằm đè lên
 * giữa màn nên nó che mất chính cái băng cuộn đang đỗ trên tay máy. Chỉ để lại
 * dòng chữ thì người chơi mất luôn hình ảnh của thứ vừa quyết định ván đấu.
 */
function ResultDialog({
  round,
  target,
  onClose,
}: {
  round: RoundView
  target: number
  onClose: () => void
}) {
  const won = round.outcome === 'win'
  const runOver = round.status !== 'active'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-dialog-title"
      // Bấm ra ngoài cũng đóng, nhưng vẫn phải đi qua onClose để băng cuộn quay
      // lại. Đóng bằng bất kỳ đường nào khác sẽ để lại một cái trống đứng im.
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p
          id="result-dialog-title"
          className={`text-3xl font-black ${won ? 'text-amber-500' : 'text-slate-900'}`}
        >
          {won
            ? round.status === 'won'
              ? `You won all ${target}!`
              : `Round ${round.nonce + 1} won!`
            : `Round ${round.nonce + 1} lost`}
        </p>

        <div className="flex items-center justify-center gap-4">
          <DialogHand label="You" hand={round.playerHand} />
          <span className="text-sm font-bold text-slate-400">{won ? 'beats' : 'loses to'}</span>
          <DialogHand label="Machine" hand={round.serverHand} />
        </div>

        <p className="text-lg font-bold text-slate-900">
          {won ? `Streak ${round.wins}/${target}` : `Streak broken at round ${round.wins + 1}`}
        </p>

        <StreakBar wins={round.wins} target={target} />

        <button
          autoFocus
          className="w-full rounded-full bg-slate-900 px-4 py-3 text-lg font-bold text-white active:scale-95"
          onClick={onClose}
        >
          {runOver ? 'See result' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function DialogHand({ label, hand }: { label: string; hand: Hand }) {
  return (
    <div className="space-y-1">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: HAND_COLORS_CSS[hand] }}
      >
        <HandIcon hand={hand} className="h-9 w-9" />
      </div>
      <p className="text-xs font-bold text-slate-500">
        {label}: {HAND_NAMES[hand]}
      </p>
    </div>
  )
}

function SpeechBubble({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative rounded-2xl bg-amber-500 px-5 py-4 text-center text-white">
      <p className="text-2xl font-black tracking-wide">{title}</p>
      <p className="mt-1 text-base font-bold">{subtitle}</p>
      {/* Đuôi bong bóng: một hình vuông xoay 45° nhô ra dưới mép trái. */}
      <span className="absolute -bottom-2 left-8 h-4 w-4 rotate-45 bg-amber-500" aria-hidden="true" />
    </div>
  )
}

/** Chuỗi thắng dạng vạch, để người chơi thấy mình đang ở đâu mà không phải đọc số. */
function StreakBar({ wins, target }: { wins: number; target: number }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < wins ? 'bg-amber-500' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  )
}
