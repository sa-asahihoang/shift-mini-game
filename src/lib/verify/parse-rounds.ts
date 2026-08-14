import type { RecordedRound } from '@/lib/fairness'
import { isHand } from '@/lib/game/hands'

const OUTCOMES = new Set(['win', 'lose', 'draw'])

export function parseRoundsInput(raw: string): RecordedRound[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('không đọc được dữ liệu — cần một mảng JSON các ván')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('không đọc được dữ liệu — cần một mảng JSON các ván')
  }

  return parsed.map((item, index) => {
    // Chặn null và giá trị nguyên thuỷ TRƯỚC khi ép kiểu: `[null]` mà đọc thẳng
    // `item.nonce` sẽ ném TypeError thô của engine, và người dùng nhận một thông
    // báo tiếng Anh khó hiểu thay vì lời giải thích họ hành động được.
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`ván thứ ${index + 1} không phải một đối tượng hợp lệ`)
    }

    const round = item as Partial<RecordedRound>
    if (round.nonce === undefined || round.playerHand === undefined || round.serverHand === undefined) {
      throw new Error(`ván thứ ${index + 1} thiếu trường bắt buộc`)
    }
    if (typeof round.nonce !== 'number' || !Number.isInteger(round.nonce) || round.nonce < 0) {
      throw new Error(`ván thứ ${index + 1} có nonce không hợp lệ, phải là số nguyên không âm`)
    }
    if (!isHand(round.playerHand) || !isHand(round.serverHand)) {
      throw new Error(`ván thứ ${index + 1} có tay không hợp lệ, phải là 0, 1 hoặc 2`)
    }
    if (typeof round.outcome !== 'string' || !OUTCOMES.has(round.outcome)) {
      throw new Error(`ván thứ ${index + 1} thiếu kết quả hợp lệ`)
    }
    return {
      nonce: round.nonce,
      playerHand: round.playerHand,
      serverHand: round.serverHand,
      outcome: round.outcome,
    }
  })
}
