import { describe, expect, it } from 'vitest'
import { parseRoundsInput } from './parse-rounds'

describe('parseRoundsInput', () => {
  it('đọc JSON dán từ trang quản trị', () => {
    const raw = JSON.stringify([
      { nonce: 0, playerHand: 1, serverHand: 0, outcome: 'win' },
      { nonce: 1, playerHand: 2, serverHand: 2, outcome: 'draw' },
    ])
    expect(parseRoundsInput(raw)).toHaveLength(2)
    expect(parseRoundsInput(raw)[0].outcome).toBe('win')
  })

  it('trả mảng rỗng khi để trống', () => {
    expect(parseRoundsInput('')).toEqual([])
    expect(parseRoundsInput('   ')).toEqual([])
  })

  it('ném lỗi rõ ràng khi JSON hỏng', () => {
    expect(() => parseRoundsInput('{khong-phai-json')).toThrow(/không đọc được/)
  })

  it('ném lỗi khi thiếu trường bắt buộc', () => {
    expect(() => parseRoundsInput('[{"nonce":0}]')).toThrow(/thiếu/)
  })

  it('ném lỗi khi tay nằm ngoài 0..2', () => {
    expect(() =>
      parseRoundsInput('[{"nonce":0,"playerHand":5,"serverHand":0,"outcome":"win"}]'),
    ).toThrow(/tay/)
  })

  it('ném lỗi rõ ràng thay vì TypeError thô với các hình dạng lạ', () => {
    // Đọc thẳng thuộc tính trên null sẽ ném TypeError của engine, và người dùng
    // nhận một chuỗi tiếng Anh nội bộ thay vì lời giải thích họ hành động được.
    expect(() => parseRoundsInput('[null]')).toThrow(/không phải một đối tượng hợp lệ/)
    expect(() => parseRoundsInput('["chuoi"]')).toThrow(/không phải một đối tượng hợp lệ/)
    expect(() => parseRoundsInput('[[]]')).toThrow(/không phải một đối tượng hợp lệ/)
    expect(() => parseRoundsInput('{"nonce":0}')).toThrow(/không đọc được dữ liệu/)
  })

  it('ném lỗi khi nonce sai kiểu, với thông báo đúng nguyên nhân', () => {
    // Thông báo cũ nói "thiếu trường bắt buộc" dù trường có mặt, chỉ sai kiểu.
    expect(() =>
      parseRoundsInput('[{"nonce":"0","playerHand":0,"serverHand":1,"outcome":"lose"}]'),
    ).toThrow(/nonce không hợp lệ/)
  })
})
