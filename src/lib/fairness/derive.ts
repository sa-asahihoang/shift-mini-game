import { createHash, createHmac } from 'node:crypto'
import type { Hand } from '@/lib/game/hands'

const UINT32_COUNT = 0x1_0000_0000
/** 4_294_967_295 — giá trị từ mốc này trở lên bị loại để mod 3 không lệch. */
const REJECT_FROM = Math.floor(UINT32_COUNT / 3) * 3

/**
 * Tay của server ở ván thứ `nonce`.
 *
 * Lấy `uint32 mod 3` trực tiếp sẽ lệch vì 2^32 không chia hết cho 3. Sai lệch chỉ
 * cỡ 2e-10 nên vô nghĩa trên thực tế, nhưng cả dự án dựng lên để chứng minh sự
 * công bằng nên không để hở điểm cho người khác bắt bẻ.
 *
 * Digest có 32 byte, đọc thành 8 khối 4 byte. Xác suất một khối bị loại là 1/2^32,
 * nên vòng lặp ngoài gần như không bao giờ chạy tới lần thứ hai; nó tồn tại chỉ để
 * hàm luôn tất định và luôn có giá trị trả về.
 */
export function deriveHand(serverSeed: string, clientSeed: string, nonce: number): Hand {
  let digest = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest()

  for (;;) {
    for (let offset = 0; offset + 4 <= digest.length; offset += 4) {
      const value = digest.readUInt32BE(offset)
      if (value < REJECT_FROM) {
        return (value % 3) as Hand
      }
    }
    digest = createHash('sha256').update(digest).digest()
  }
}
