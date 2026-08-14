/** 0 = kéo, 1 = búa, 2 = bao. Thứ tự này là một phần của giao ước kiểm chứng — không đổi. */
export type Hand = 0 | 1 | 2

export type Outcome = 'win' | 'lose' | 'draw'

/** Nhãn hiển thị. Giao diện cho người chơi dùng tiếng Anh; comment và commit vẫn tiếng Việt. */
export const HAND_NAMES: Record<Hand, string> = { 0: 'scissors', 1: 'rock', 2: 'paper' }

export function isHand(value: unknown): value is Hand {
  return value === 0 || value === 1 || value === 2
}

/** Phân định dưới góc nhìn của người chơi. */
export function judge(player: Hand, server: Hand): Outcome {
  switch ((player - server + 3) % 3) {
    case 0:
      return 'draw'
    case 1:
      return 'win'
    default:
      return 'lose'
  }
}
