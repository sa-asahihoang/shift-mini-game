import { describe, expect, it } from 'vitest'
import { assertRequiredEnv } from './instrumentation'

const full = {
  SESSION_SECRET: 'a'.repeat(64),
  IP_HASH_SALT: 'b'.repeat(64),
  ADMIN_TOKEN: 'c'.repeat(32),
}

describe('assertRequiredEnv', () => {
  it('cho qua khi có đủ ba biến', () => {
    expect(() => assertRequiredEnv(full)).not.toThrow()
  })

  it('gọi tên đúng biến còn thiếu', () => {
    expect(() => assertRequiredEnv({ ...full, SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/)
    expect(() => assertRequiredEnv({ ...full, IP_HASH_SALT: undefined })).toThrow(/IP_HASH_SALT/)
    // Thiếu ADMIN_TOKEN thì assertAdmin từ chối tất cả — một triển khai không xử
    // được khiếu nại nào là một triển khai cấu hình sai, không phải lựa chọn.
    expect(() => assertRequiredEnv({ ...full, ADMIN_TOKEN: undefined })).toThrow(/ADMIN_TOKEN/)
  })

  it('chuỗi rỗng cũng là thiếu', () => {
    expect(() => assertRequiredEnv({ ...full, IP_HASH_SALT: '' })).toThrow(/IP_HASH_SALT/)
  })

  it('kể hết mọi biến thiếu trong một lần, không bắt sửa từng cái một', () => {
    expect(() => assertRequiredEnv({})).toThrow(/SESSION_SECRET.*IP_HASH_SALT.*ADMIN_TOKEN/)
  })
})
