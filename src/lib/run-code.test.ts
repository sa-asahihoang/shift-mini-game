import { describe, expect, it } from 'vitest'
import { RUN_CODE_PATTERN, generateRunCode } from './run-code'

describe('generateRunCode', () => {
  it('đúng định dạng JKN-XXXX-XXXX', () => {
    expect(generateRunCode()).toMatch(RUN_CODE_PATTERN)
  })

  it('không dùng ký tự dễ đọc nhầm I, L, O, U', () => {
    const codes = Array.from({ length: 500 }, () => generateRunCode()).join('')
    expect(codes).not.toMatch(/[ILOU]/)
  })

  it('gần như không va chạm trong 20000 lần sinh', () => {
    const codes = new Set(Array.from({ length: 20_000 }, () => generateRunCode()))
    expect(codes.size).toBe(20_000)
  })
})
