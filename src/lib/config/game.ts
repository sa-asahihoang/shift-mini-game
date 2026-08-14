export interface GameConfig {
  targetWins: number
  maxRoundsPerRun: number
}

const DEFAULTS: GameConfig = { targetWins: 20, maxRoundsPerRun: 300 }

function readInt(env: Partial<NodeJS.ProcessEnv>, key: string, fallback: number, min: number): number {
  const raw = env[key]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${key} phải là số nguyên >= ${min}, nhận được "${raw}"`)
  }
  return value
}

/**
 * `Partial<>` không phải để cho rộng rãi: Next.js khai báo bổ sung `NODE_ENV` dạng
 * required vào `NodeJS.ProcessEnv`, nên `loadGameConfig({})` trong test sẽ không
 * biên dịch được nếu dùng thẳng `NodeJS.ProcessEnv`.
 */
export function loadGameConfig(env: Partial<NodeJS.ProcessEnv> = process.env): GameConfig {
  const targetWins = readInt(env, 'TARGET_WINS', DEFAULTS.targetWins, 1)
  const maxRoundsPerRun = readInt(env, 'MAX_ROUNDS_PER_RUN', DEFAULTS.maxRoundsPerRun, 1)

  if (maxRoundsPerRun < targetWins) {
    throw new Error(
      `MAX_ROUNDS_PER_RUN (${maxRoundsPerRun}) không được nhỏ hơn TARGET_WINS (${targetWins}) — lượt sẽ không bao giờ thắng được`,
    )
  }

  return { targetWins, maxRoundsPerRun }
}
