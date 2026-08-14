import { randomBytes } from 'node:crypto'

/** Base32 Crockford — bỏ I, L, O, U để người chơi không đọc nhầm khi khiếu nại. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const RUN_CODE_PATTERN = /^JKN-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/

/** 40 bit ngẫu nhiên thành 8 ký tự. Va chạm chỉ đáng kể sau khoảng 1 triệu lượt. */
export function generateRunCode(): string {
  const bytes = randomBytes(5)
  let bits = BigInt(0)
  for (const byte of bytes) bits = (bits << BigInt(8)) | BigInt(byte)

  let chars = ''
  for (let i = 7; i >= 0; i--) {
    chars += ALPHABET[Number((bits >> BigInt(i * 5)) & BigInt(31))]
  }
  return `JKN-${chars.slice(0, 4)}-${chars.slice(4)}`
}
