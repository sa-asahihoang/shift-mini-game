import { describe, expect, it } from 'vitest'
import { loadGameConfig } from './game'

describe('loadGameConfig', () => {
  it('dùng giá trị mặc định khi không có env', () => {
    expect(loadGameConfig({})).toEqual({ targetWins: 20, maxRoundsPerRun: 300 })
  })

  it('đọc được giá trị từ env', () => {
    const config = loadGameConfig({ TARGET_WINS: '5', MAX_ROUNDS_PER_RUN: '50' })
    expect(config).toEqual({ targetWins: 5, maxRoundsPerRun: 50 })
  })

  it('từ chối targetWins không phải số nguyên dương', () => {
    expect(() => loadGameConfig({ TARGET_WINS: '0' })).toThrow(/TARGET_WINS/)
    expect(() => loadGameConfig({ TARGET_WINS: 'hai muoi' })).toThrow(/TARGET_WINS/)
    expect(() => loadGameConfig({ TARGET_WINS: '2.5' })).toThrow(/TARGET_WINS/)
  })

  it('từ chối trần số ván nhỏ hơn số ván cần thắng', () => {
    expect(() => loadGameConfig({ TARGET_WINS: '20', MAX_ROUNDS_PER_RUN: '10' })).toThrow(
      /MAX_ROUNDS_PER_RUN/,
    )
  })

  // ATTEMPTS_PER_DAY từng được đọc và kiểm ở đây nhưng không có chỗ nào dùng.
  // Âm thầm bỏ qua một hạn mức mà người vận hành đã đặt còn tệ hơn là không mời
  // chào hạn mức đó, nên nó bị gỡ hẳn thay vì để lại như một lời hứa suông.
  it('lờ đi biến lạ thay vì nổ', () => {
    expect(loadGameConfig({ ATTEMPTS_PER_DAY: '3' })).toEqual({ targetWins: 20, maxRoundsPerRun: 300 })
  })
})
