import { judge, type Hand, type Outcome } from '@/lib/game/hands'
import { deriveHand } from './derive'
import { commit } from './seed'

export interface RecordedRound {
  nonce: number
  playerHand: Hand
  serverHand: Hand
  outcome: Outcome
}

export interface VerifyInput {
  serverSeed: string
  clientSeed: string
  commitment: string
  rounds: RecordedRound[]
}

export interface VerifiedRound extends RecordedRound {
  recomputedServerHand: Hand
  recomputedOutcome: Outcome
  matches: boolean
}

export interface VerifyResult {
  commitmentValid: boolean
  allRoundsMatch: boolean
  rounds: VerifiedRound[]
}

/**
 * Dựng lại toàn bộ một lượt từ hai seed và so với bản ghi.
 *
 * Hàm thuần, không chạm mạng — trang kiểm chứng phía người chơi gọi thẳng hàm này
 * trong trình duyệt. Nếu trang kiểm chứng phải hỏi server thì nó chẳng chứng minh
 * được gì.
 */
export function verifyRun(input: VerifyInput): VerifyResult {
  const commitmentValid = commit(input.serverSeed) === input.commitment

  const rounds: VerifiedRound[] = input.rounds.map((round) => {
    const recomputedServerHand = deriveHand(input.serverSeed, input.clientSeed, round.nonce)
    const recomputedOutcome = judge(round.playerHand, recomputedServerHand)
    return {
      ...round,
      recomputedServerHand,
      recomputedOutcome,
      matches: recomputedServerHand === round.serverHand && recomputedOutcome === round.outcome,
    }
  })

  return {
    commitmentValid,
    allRoundsMatch: rounds.every((r) => r.matches),
    rounds,
  }
}
