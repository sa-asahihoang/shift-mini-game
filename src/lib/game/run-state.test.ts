import { describe, expect, it } from 'vitest'
import type { Outcome } from './hands'
import { applyOutcome, checkStoredRunState, type RunState } from './run-state'

const limits = { targetWins: 20, maxRounds: 300 }
const active = (wins: number, nextNonce: number): RunState => ({ status: 'active', wins, nextNonce })

describe('applyOutcome', () => {
  it('thắng thì tăng chuỗi và tăng nonce', () => {
    expect(applyOutcome(active(3, 7), 'win', limits)).toEqual({ status: 'active', wins: 4, nextNonce: 8 })
  })

  it('hòa thì giữ nguyên chuỗi nhưng vẫn tiêu một nonce', () => {
    expect(applyOutcome(active(3, 7), 'draw', limits)).toEqual({ status: 'active', wins: 3, nextNonce: 8 })
  })

  it('thua thì kết thúc lượt, chuỗi giữ nguyên để ghi lại', () => {
    expect(applyOutcome(active(3, 7), 'lose', limits)).toEqual({ status: 'lost', wins: 3, nextNonce: 8 })
  })

  it('chạm targetWins thì thắng lượt', () => {
    expect(applyOutcome(active(19, 25), 'win', limits)).toEqual({ status: 'won', wins: 20, nextNonce: 26 })
  })

  it('chạm trần số ván thì đóng lượt với abandoned', () => {
    expect(applyOutcome(active(5, 299), 'draw', limits)).toEqual({ status: 'abandoned', wins: 5, nextNonce: 300 })
  })

  it('ván thắng cuối cùng vẫn thắng dù chạm trần cùng lúc', () => {
    expect(applyOutcome(active(19, 299), 'win', limits)).toEqual({ status: 'won', wins: 20, nextNonce: 300 })
  })

  it('từ chối chơi tiếp trên lượt đã kết thúc', () => {
    expect(() => applyOutcome({ status: 'lost', wins: 2, nextNonce: 5 }, 'win', limits)).toThrow(
      /không còn active/,
    )
  })
})

describe('checkStoredRunState', () => {
  const short = { targetWins: 3, maxRounds: 10 }
  const wins = (n: number): Outcome[] => Array.from({ length: n }, () => 'win' as const)

  it('khớp khi số thắng và trạng thái dựng lại đúng bằng bản ghi', () => {
    const check = checkStoredRunState({ status: 'won', wins: 3 }, wins(3), short)
    expect(check.matches).toBe(true)
    expect(check.derived).toEqual({ status: 'won', wins: 3 })
  })

  it('bắt được chuỗi thắng bị sửa dù từng ván vẫn hợp lệ', () => {
    // Đây là khiếu nại mà trang đối chiếu sinh ra để xử: mỗi ván đều dựng lại
    // được từ hạt giống, chỉ con số tổng là sai.
    const check = checkStoredRunState({ status: 'lost', wins: 20 }, ['win', 'lose'], short)
    expect(check.matches).toBe(false)
    expect(check.derived).toEqual({ status: 'lost', wins: 1 })
    expect(check.stored).toEqual({ status: 'lost', wins: 20 })
  })

  it('bắt được trạng thái bị sửa', () => {
    expect(checkStoredRunState({ status: 'won', wins: 1 }, ['win', 'lose'], short).matches).toBe(false)
  })

  it('chấp nhận lượt bỏ dở: bỏ lượt là hành động ngoài sổ ván', () => {
    const check = checkStoredRunState({ status: 'abandoned', wins: 1 }, ['win', 'draw'], short)
    expect(check.matches).toBe(true)
    expect(check.derived.status).toBe('active')
  })

  it('vẫn bắt số thắng sai ở lượt bỏ dở', () => {
    expect(checkStoredRunState({ status: 'abandoned', wins: 9 }, ['win'], short).matches).toBe(false)
  })

  it('lượt còn đang chơi dựng lại ra active', () => {
    expect(checkStoredRunState({ status: 'active', wins: 2 }, ['win', 'draw', 'win'], short).matches).toBe(true)
  })

  it('báo lệch khi sổ ván còn ván sau lúc lượt đã kết thúc', () => {
    const check = checkStoredRunState({ status: 'lost', wins: 0 }, ['lose', 'win'], short)
    expect(check.extraRounds).toBe(true)
    expect(check.matches).toBe(false)
  })

  it('dùng trần của chính lượt đó chứ không phải mặc định', () => {
    // 3 ván thắng là thắng lượt với targetWins = 3, nhưng vẫn còn active với 20.
    expect(checkStoredRunState({ status: 'won', wins: 3 }, wins(3), short).matches).toBe(true)
    expect(
      checkStoredRunState({ status: 'won', wins: 3 }, wins(3), { targetWins: 20, maxRounds: 300 }).matches,
    ).toBe(false)
  })
})
