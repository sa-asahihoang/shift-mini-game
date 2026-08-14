import type { Outcome } from './hands'

export type RunStatus = 'active' | 'won' | 'lost' | 'abandoned'

export interface RunState {
  status: RunStatus
  wins: number
  nextNonce: number
}

export interface RunLimits {
  targetWins: number
  maxRounds: number
}

/**
 * Chuyển trạng thái sau một ván. Hàm thuần, không biết gì về DB.
 * Thứ tự kiểm tra quan trọng: thắng lượt được xét trước trần số ván,
 * để ván thắng thứ 20 rơi đúng vào ván cuối cùng vẫn được tính là thắng.
 */
export function applyOutcome(state: RunState, outcome: Outcome, limits: RunLimits): RunState {
  if (state.status !== 'active') {
    throw new Error(`lượt không còn active (đang là ${state.status})`)
  }

  const nextNonce = state.nextNonce + 1

  if (outcome === 'lose') {
    return { status: 'lost', wins: state.wins, nextNonce }
  }

  const wins = outcome === 'win' ? state.wins + 1 : state.wins

  if (wins >= limits.targetWins) {
    return { status: 'won', wins, nextNonce }
  }
  if (nextNonce >= limits.maxRounds) {
    return { status: 'abandoned', wins, nextNonce }
  }
  return { status: 'active', wins, nextNonce }
}

export interface RunStateCheck {
  /** true nếu `runs.status` và `runs.wins` dựng lại được từ sổ ván. */
  matches: boolean
  derived: { status: RunStatus; wins: number }
  stored: { status: RunStatus; wins: number }
  /** Sổ ván còn ván sau khi lượt đã kết thúc — tự nó là một dạng lệch. */
  extraRounds: boolean
}

/**
 * Bỏ lượt là hành động NGOÀI sổ ván: người chơi dừng khi lượt còn active, nên
 * dựng lại từ ván chỉ ra được 'active'. Trường hợp còn lại của 'abandoned' là
 * chạm trần số ván, và cái đó thì dựng lại được.
 */
function statusConsistent(stored: RunStatus, derived: RunStatus): boolean {
  if (stored === 'abandoned') return derived === 'active' || derived === 'abandoned'
  return stored === derived
}

/**
 * Dựng lại `status`/`wins` từ chính sổ ván rồi so với hàng đã lưu.
 *
 * `verifyRun` chỉ trả lời "tay của máy có suy ra được từ seed không" — nó không
 * bao giờ chạm tới `runs.wins`. Nghĩa là đúng khiếu nại mà trang đối chiếu sinh
 * ra để xử — "tôi thắng 20 ván liền mà bị ghi là thua" — lại là khiếu nại nó
 * trả lời sai: mọi ván khớp, banner xanh, trong khi con số tổng đã hỏng.
 */
export function checkStoredRunState(
  stored: { status: RunStatus; wins: number },
  outcomes: Outcome[],
  limits: RunLimits,
): RunStateCheck {
  let state: RunState = { status: 'active', wins: 0, nextNonce: 0 }
  let extraRounds = false

  for (const outcome of outcomes) {
    if (state.status !== 'active') {
      extraRounds = true
      break
    }
    state = applyOutcome(state, outcome, limits)
  }

  const derived = { status: state.status, wins: state.wins }
  return {
    matches: !extraRounds && derived.wins === stored.wins && statusConsistent(stored.status, derived.status),
    derived,
    stored,
    extraRounds,
  }
}
