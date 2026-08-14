import { describe, expect, it } from 'vitest'
import { commit } from './seed'
import { deriveHand } from './derive'
import { verifyRun } from './verify'
import { judge, type Hand } from '@/lib/game/hands'

const FIXED_SERVER_SEED = '7b'.repeat(32)
const FIXED_CLIENT_SEED = 'hat-giong-kiem-chung'

function honestRun(roundCount: number) {
  const serverSeed = FIXED_SERVER_SEED
  const clientSeed = FIXED_CLIENT_SEED
  const rounds = Array.from({ length: roundCount }, (_, nonce) => {
    const playerHand = (nonce % 3) as Hand
    const serverHand = deriveHand(serverSeed, clientSeed, nonce)
    return { nonce, playerHand, serverHand, outcome: judge(playerHand, serverHand) }
  })
  return { serverSeed, clientSeed, commitment: commit(serverSeed), rounds }
}

describe('verifyRun', () => {
  it('xác nhận một lượt trung thực', () => {
    const result = verifyRun(honestRun(20))
    expect(result.commitmentValid).toBe(true)
    expect(result.allRoundsMatch).toBe(true)
    expect(result.rounds).toHaveLength(20)
    expect(result.rounds.every((r) => r.matches)).toBe(true)
  })

  it('bắt được commitment không khớp seed', () => {
    const run = honestRun(5)
    const result = verifyRun({ ...run, commitment: 'f'.repeat(64) })
    expect(result.commitmentValid).toBe(false)
  })

  it('bắt được tay server bị sửa trong bản ghi', () => {
    const run = honestRun(5)
    const tampered = run.rounds.map((r, i) =>
      i === 2 ? { ...r, serverHand: ((r.serverHand + 1) % 3) as Hand } : r,
    )
    const result = verifyRun({ ...run, rounds: tampered })
    expect(result.allRoundsMatch).toBe(false)
    expect(result.rounds[2].matches).toBe(false)
    expect(result.rounds[0].matches).toBe(true)
  })

  it('bắt được kết quả phân định bị sửa dù tay vẫn đúng', () => {
    const run = honestRun(20)

    // Chọn một ván có kết quả thật khác 'win', để phép sửa bên dưới luôn là một
    // thay đổi thực sự. Nếu nhắm cứng vào một chỉ số và ván đó vốn đã 'win' thì
    // "sửa" thành no-op và test đi qua mà không kiểm gì — đúng thứ nó phải bắt.
    const target = run.rounds.findIndex((r) => r.outcome !== 'win')
    expect(target).toBeGreaterThanOrEqual(0)

    const tampered = run.rounds.map((r, i) => (i === target ? { ...r, outcome: 'win' as const } : r))
    const result = verifyRun({ ...run, rounds: tampered })

    expect(result.rounds[target].matches).toBe(false)
    expect(result.allRoundsMatch).toBe(false)
  })

  it('lượt rỗng vẫn kiểm được commitment', () => {
    const run = honestRun(0)
    const result = verifyRun(run)
    expect(result.commitmentValid).toBe(true)
    expect(result.allRoundsMatch).toBe(true)
  })
})
