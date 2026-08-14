import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { commit, generateClientSeed, generateServerSeed } from './seed'

describe('generateServerSeed', () => {
  it('trả về 64 ký tự hex', () => {
    expect(generateServerSeed()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('không lặp lại giữa các lần gọi', () => {
    const seeds = new Set(Array.from({ length: 1000 }, () => generateServerSeed()))
    expect(seeds.size).toBe(1000)
  })
})

describe('generateClientSeed', () => {
  it('trả về 32 ký tự hex', () => {
    expect(generateClientSeed()).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('commit', () => {
  it('băm chuỗi hex ở dạng utf8, đúng như trang verify sẽ làm', () => {
    const seed = 'a'.repeat(64)
    const expected = createHash('sha256').update(seed, 'utf8').digest('hex')
    expect(commit(seed)).toBe(expected)
  })

  it('tất định', () => {
    const seed = generateServerSeed()
    expect(commit(seed)).toBe(commit(seed))
  })

  it('seed khác nhau cho commitment khác nhau', () => {
    expect(commit(generateServerSeed())).not.toBe(commit(generateServerSeed()))
  })
})
