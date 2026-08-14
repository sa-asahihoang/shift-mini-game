import { createHash, randomBytes } from 'node:crypto'

export const SERVER_SEED_BYTES = 32
export const CLIENT_SEED_BYTES = 16

export function generateServerSeed(): string {
  return randomBytes(SERVER_SEED_BYTES).toString('hex')
}

export function generateClientSeed(): string {
  return randomBytes(CLIENT_SEED_BYTES).toString('hex')
}

/**
 * Cam kết công bố ngay khi bắt đầu lượt.
 *
 * Băm **chuỗi hex ở dạng utf8**, không băm bytes. Người chơi sẽ dán đúng chuỗi
 * hex đó vào trang kiểm chứng, nên hai bên phải băm cùng một thứ. Đổi chỗ này
 * là mọi lượt chơi trong lịch sử không còn kiểm chứng được.
 */
export function commit(serverSeed: string): string {
  return createHash('sha256').update(serverSeed, 'utf8').digest('hex')
}
