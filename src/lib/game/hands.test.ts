import { describe, expect, it } from 'vitest'
import { judge, isHand, type Hand } from './hands'

const KEO: Hand = 0
const BUA: Hand = 1
const BAO: Hand = 2

describe('judge', () => {
  it('hòa khi hai tay giống nhau', () => {
    expect(judge(KEO, KEO)).toBe('draw')
    expect(judge(BUA, BUA)).toBe('draw')
    expect(judge(BAO, BAO)).toBe('draw')
  })

  it('kéo thắng bao, búa thắng kéo, bao thắng búa', () => {
    expect(judge(KEO, BAO)).toBe('win')
    expect(judge(BUA, KEO)).toBe('win')
    expect(judge(BAO, BUA)).toBe('win')
  })

  it('kéo thua búa, búa thua bao, bao thua kéo', () => {
    expect(judge(KEO, BUA)).toBe('lose')
    expect(judge(BUA, BAO)).toBe('lose')
    expect(judge(BAO, KEO)).toBe('lose')
  })
})

describe('isHand', () => {
  it('chỉ chấp nhận 0, 1, 2', () => {
    expect(isHand(0)).toBe(true)
    expect(isHand(2)).toBe(true)
    expect(isHand(3)).toBe(false)
    expect(isHand('1')).toBe(false)
    expect(isHand(null)).toBe(false)
    expect(isHand(1.5)).toBe(false)
  })
})
