# Provably Fair Janken — Kế hoạch triển khai MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây game kéo búa bao bất đồng bộ, người chơi phải thắng 20 ván liên tiếp, với cơ chế seed-pair cam kết khiến việc server gian lận không khả thi về mặt toán học và kiểm chứng được bởi chính người chơi.

**Architecture:** Next.js App Router stateless, toàn bộ state ở Postgres. Hai tầng hàm thuần (`lib/fairness`, `lib/game`) không chạm I/O, dùng chung cho cả server lẫn trang kiểm chứng phía trình duyệt. Tầng service giữ ranh giới transaction, tầng repo là nơi duy nhất chạm DB. Redis chỉ dùng cho rate limit.

**Tech Stack:** Node 22 · Next.js 15 (App Router) · TypeScript strict · Drizzle ORM + postgres.js · PostgreSQL 16 · Redis 7 (ioredis) · Zod · Pino · Tailwind CSS v4 · Vitest · fast-check · Testcontainers · Playwright

**Spec:** [docs/superpowers/specs/2026-08-12-provably-fair-janken-design.md](../specs/2026-08-12-provably-fair-janken-design.md)

## Global Constraints

Mọi task đều ngầm chịu các ràng buộc sau.

- **Package manager:** `npm`. Node 22 LTS. TypeScript `strict: true`, không dùng `any`.
- **Mã hoá tay:** `0 = kéo`, `1 = búa`, `2 = bao`. Không đổi, không hoán vị — đổi là mọi lượt chơi trong lịch sử hỏng.
- **Phân định:** `(player - server + 3) % 3` → `0` hòa, `1` người chơi thắng, `2` người chơi thua.
- **`commitment = SHA256(serverSeed)`** trong đó `serverSeed` được băm ở dạng **chuỗi hex utf8**, không phải bytes. Người chơi dán chuỗi hex vào trang verify nên hai bên phải băm cùng một thứ.
- **Tay server:** `HMAC-SHA256(key = serverSeed hex string, message = \`${clientSeed}:${nonce}\`)`, rejection sampling rồi `mod 3`.
- **`serverSeed` không bao giờ xuất hiện** trong response hay trong log khi lượt còn `status = 'active'`. Vi phạm điều này là làm sập toàn bộ giá trị của dự án.
- **File snapshot golden vector** (`src/lib/fairness/__snapshots__/derive.test.ts.snap`) một khi đã commit thì **không bao giờ được cập nhật**. Snapshot đổi nghĩa là công thức suy ra tay server đã đổi, và mọi lượt chơi cũ không còn kiểm chứng được. Nếu snapshot fail, sửa code chứ không chạy `-u`.
- **Tham số game đọc từ biến môi trường** với giá trị mặc định: `TARGET_WINS=20`, `MAX_ROUNDS_PER_RUN=300`, `ATTEMPTS_PER_DAY=0` (0 = không giới hạn).
- **Mọi bảng ghi bằng snake_case**, mọi identifier TypeScript bằng camelCase.
- **`rounds` và `audit_events` chỉ ghi thêm.** Không có code nào được `UPDATE` hay `DELETE` hai bảng này.
- **Commit sau mỗi task**, dùng conventional commits.

### Sai lệch có chủ ý so với spec

Spec quy định chụp `target_wins` vào từng lượt để đổi config không làm hỏng lượt đang chạy. Kế hoạch này chụp cả `max_rounds` theo đúng lý do đó — cùng một lập luận, cùng một rủi ro.

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/lib/config/game.ts` | Đọc và validate tham số game từ env |
| `src/lib/game/hands.ts` | Kiểu `Hand`, `Outcome`, hàm `judge` |
| `src/lib/game/run-state.ts` | Máy trạng thái lượt chơi, hàm `applyOutcome` |
| `src/lib/fairness/seed.ts` | Sinh seed, tạo commitment |
| `src/lib/fairness/derive.ts` | Suy ra tay server, rejection sampling |
| `src/lib/fairness/verify.ts` | Dựng lại toàn bộ một lượt từ hai seed |
| `src/lib/run-code.ts` | Sinh mã lượt Base32 Crockford |
| `src/lib/db/schema.ts` | Định nghĩa bảng Drizzle |
| `src/lib/db/client.ts` | Kết nối Postgres |
| `src/lib/repo/*.ts` | Truy vấn DB, nơi duy nhất chạm SQL |
| `src/lib/services/start-run.ts` | Tạo lượt mới hoặc trả lượt đang chạy |
| `src/lib/services/play-round.ts` | Chơi một ván trong transaction có khoá dòng |
| `src/lib/services/abandon-run.ts` | Bỏ lượt và lộ seed |
| `src/lib/services/errors.ts` | Lỗi có kiểu, mang theo payload audit |
| `src/lib/session/cookie.ts` | Cookie session ẩn danh có chữ ký |
| `src/lib/observability/*.ts` | Logger, request context, redaction |
| `src/lib/rate-limit/index.ts` | Rate limit bằng Redis |
| `src/app/api/runs/**` | Route handler mỏng |
| `src/app/(game)/page.tsx` | Màn chơi |
| `src/app/verify/page.tsx` | Trang kiểm chứng, chạy 100% trên trình duyệt |
| `src/app/stats/page.tsx` | Thống kê công khai |
| `src/app/admin/runs/[code]/page.tsx` | Tra cứu một lượt để xử khiếu nại |
| `scripts/audit-runs.ts` | Job tự đối chiếu hằng đêm |

---

## Task 1: Khởi tạo dự án và bộ công cụ test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: lệnh `npm test` chạy Vitest; alias import `@/` trỏ tới `src/`

- [ ] **Step 1: Khởi tạo Next.js**

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```

Khi được hỏi ghi đè file đang có, chọn giữ lại `docs/` và `CLAUDE.md`.

- [ ] **Step 2: Cài phụ thuộc test và runtime**

```bash
npm install drizzle-orm postgres ioredis zod pino
npm install -D vitest @vitest/coverage-v8 fast-check drizzle-kit tsx @types/node
```

- [ ] **Step 3: Tạo `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 4: Thêm script vào `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Viết test smoke**

```ts
// src/lib/smoke.test.ts
import { describe, expect, it } from 'vitest'

describe('bộ công cụ test', () => {
  it('chạy được', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Chạy test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 7: Chạy typecheck**

Run: `npm run typecheck`
Expected: không có lỗi.

- [ ] **Step 8: Tạo `.env.example`**

```bash
DATABASE_URL=postgres://janken:janken@localhost:5432/janken
REDIS_URL=redis://localhost:6379
SESSION_SECRET=doi-gia-tri-nay-bang-32-byte-ngau-nhien
IP_HASH_SALT=doi-gia-tri-nay-bang-32-byte-ngau-nhien
ADMIN_TOKEN=doi-gia-tri-nay
TARGET_WINS=20
MAX_ROUNDS_PER_RUN=300
ATTEMPTS_PER_DAY=0
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: khởi tạo Next.js, TypeScript và Vitest"
```

---

## Task 2: Luật chơi — phân định và máy trạng thái

Đây là tầng hàm thuần đầu tiên. Không import gì ngoài kiểu của chính nó.

**Files:**
- Create: `src/lib/game/hands.ts`, `src/lib/game/run-state.ts`
- Test: `src/lib/game/hands.test.ts`, `src/lib/game/run-state.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `type Hand = 0 | 1 | 2`
  - `type Outcome = 'win' | 'lose' | 'draw'`
  - `type RunStatus = 'active' | 'won' | 'lost' | 'abandoned'`
  - `function isHand(v: unknown): v is Hand`
  - `function judge(player: Hand, server: Hand): Outcome`
  - `interface RunState { status: RunStatus; wins: number; nextNonce: number }`
  - `interface RunLimits { targetWins: number; maxRounds: number }`
  - `function applyOutcome(state: RunState, outcome: Outcome, limits: RunLimits): RunState`

- [ ] **Step 1: Viết test bảng chân trị**

```ts
// src/lib/game/hands.test.ts
import { describe, expect, it } from 'vitest'
import { judge, isHand, type Hand } from './hands'

const KEO: Hand = 0
const BUA: Hand = 1
const BAO: Hand = 2

describe('judge', () => {
  it('hòa khi hai tay giống nhau', () => {
    expect(judge(KEO, KEO)).toBe('draw')
    expect(judge(BUA, BUA)).toBe('draw')
    expect(judge(BAO, BAO)).toBe('draw')
  })

  it('kéo thắng bao, búa thắng kéo, bao thắng búa', () => {
    expect(judge(KEO, BAO)).toBe('win')
    expect(judge(BUA, KEO)).toBe('win')
    expect(judge(BAO, BUA)).toBe('win')
  })

  it('kéo thua búa, búa thua bao, bao thua kéo', () => {
    expect(judge(KEO, BUA)).toBe('lose')
    expect(judge(BUA, BAO)).toBe('lose')
    expect(judge(BAO, KEO)).toBe('lose')
  })
})

describe('isHand', () => {
  it('chỉ chấp nhận 0, 1, 2', () => {
    expect(isHand(0)).toBe(true)
    expect(isHand(2)).toBe(true)
    expect(isHand(3)).toBe(false)
    expect(isHand('1')).toBe(false)
    expect(isHand(null)).toBe(false)
    expect(isHand(1.5)).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/game/hands.test.ts`
Expected: FAIL — không tìm thấy module `./hands`.

- [ ] **Step 3: Viết `hands.ts`**

```ts
// src/lib/game/hands.ts

/** 0 = kéo, 1 = búa, 2 = bao. Thứ tự này là một phần của giao ước kiểm chứng — không đổi. */
export type Hand = 0 | 1 | 2

export type Outcome = 'win' | 'lose' | 'draw'

export const HAND_NAMES: Record<Hand, string> = { 0: 'kéo', 1: 'búa', 2: 'bao' }

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
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/game/hands.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết test máy trạng thái**

```ts
// src/lib/game/run-state.test.ts
import { describe, expect, it } from 'vitest'
import { applyOutcome, type RunState } from './run-state'

const limits = { targetWins: 20, maxRounds: 300 }
const active = (wins: number, nextNonce: number): RunState => ({ status: 'active', wins, nextNonce })

describe('applyOutcome', () => {
  it('thắng thì tăng chuỗi và tăng nonce', () => {
    expect(applyOutcome(active(3, 7), 'win', limits)).toEqual({ status: 'active', wins: 4, nextNonce: 8 })
  })

  it('hòa thì giữ nguyên chuỗi nhưng vẫn tiêu một nonce', () => {
    expect(applyOutcome(active(3, 7), 'draw', limits)).toEqual({ status: 'active', wins: 3, nextNonce: 8 })
  })

  it('thua thì kết thúc lượt, chuỗi giữ nguyên để ghi lại', () => {
    expect(applyOutcome(active(3, 7), 'lose', limits)).toEqual({ status: 'lost', wins: 3, nextNonce: 8 })
  })

  it('chạm targetWins thì thắng lượt', () => {
    expect(applyOutcome(active(19, 25), 'win', limits)).toEqual({ status: 'won', wins: 20, nextNonce: 26 })
  })

  it('chạm trần số ván thì đóng lượt với abandoned', () => {
    expect(applyOutcome(active(5, 299), 'draw', limits)).toEqual({ status: 'abandoned', wins: 5, nextNonce: 300 })
  })

  it('ván thắng cuối cùng vẫn thắng dù chạm trần cùng lúc', () => {
    expect(applyOutcome(active(19, 299), 'win', limits)).toEqual({ status: 'won', wins: 20, nextNonce: 300 })
  })

  it('từ chối chơi tiếp trên lượt đã kết thúc', () => {
    expect(() => applyOutcome({ status: 'lost', wins: 2, nextNonce: 5 }, 'win', limits)).toThrow(
      /không còn active/,
    )
  })
})
```

- [ ] **Step 6: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/game/run-state.test.ts`
Expected: FAIL — không tìm thấy module `./run-state`.

- [ ] **Step 7: Viết `run-state.ts`**

```ts
// src/lib/game/run-state.ts
import type { Outcome } from './hands'

export type RunStatus = 'active' | 'won' | 'lost' | 'abandoned'

export interface RunState {
  status: RunStatus
  wins: number
  nextNonce: number
}

export interface RunLimits {
  targetWins: number
  maxRounds: number
}

/**
 * Chuyển trạng thái sau một ván. Hàm thuần, không biết gì về DB.
 * Thứ tự kiểm tra quan trọng: thắng lượt được xét trước trần số ván,
 * để ván thắng thứ 20 rơi đúng vào ván cuối cùng vẫn được tính là thắng.
 */
export function applyOutcome(state: RunState, outcome: Outcome, limits: RunLimits): RunState {
  if (state.status !== 'active') {
    throw new Error(`lượt không còn active (đang là ${state.status})`)
  }

  const nextNonce = state.nextNonce + 1

  if (outcome === 'lose') {
    return { status: 'lost', wins: state.wins, nextNonce }
  }

  const wins = outcome === 'win' ? state.wins + 1 : state.wins

  if (wins >= limits.targetWins) {
    return { status: 'won', wins, nextNonce }
  }
  if (nextNonce >= limits.maxRounds) {
    return { status: 'abandoned', wins, nextNonce }
  }
  return { status: 'active', wins, nextNonce }
}
```

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, 10 test.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game
git commit -m "feat(game): phân định kéo búa bao và máy trạng thái lượt chơi"
```

---

## Task 3: Sinh seed và suy ra tay server

Trái tim của cơ chế công bằng. Đọc kỹ phần Global Constraints trước khi viết.

**Files:**
- Create: `src/lib/fairness/seed.ts`, `src/lib/fairness/derive.ts`
- Test: `src/lib/fairness/seed.test.ts`, `src/lib/fairness/derive.test.ts`

**Interfaces:**
- Consumes: `Hand` từ `@/lib/game/hands`
- Produces:
  - `function generateServerSeed(): string` — 64 ký tự hex
  - `function generateClientSeed(): string` — 32 ký tự hex
  - `function commit(serverSeed: string): string` — 64 ký tự hex
  - `function deriveHand(serverSeed: string, clientSeed: string, nonce: number): Hand`

- [ ] **Step 1: Viết test cho seed và commitment**

```ts
// src/lib/fairness/seed.test.ts
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
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/fairness/seed.test.ts`
Expected: FAIL — không tìm thấy module `./seed`.

- [ ] **Step 3: Viết `seed.ts`**

```ts
// src/lib/fairness/seed.ts
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
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/fairness/seed.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết test cho `deriveHand`**

Ba test này bảo vệ ba thứ khác nhau: tính tất định, phân phối đều, và tính bất biến qua thời gian.

```ts
// src/lib/fairness/derive.test.ts
import { describe, expect, it } from 'vitest'
import { deriveHand } from './derive'
import { isHand } from '@/lib/game/hands'

const SEED = '3f1c'.repeat(16)
const CLIENT = 'nguoi-choi-tu-nhap'

describe('deriveHand', () => {
  it('luôn trả về một tay hợp lệ', () => {
    for (let nonce = 0; nonce < 100; nonce++) {
      expect(isHand(deriveHand(SEED, CLIENT, nonce))).toBe(true)
    }
  })

  it('tất định — cùng input luôn ra cùng output', () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      expect(deriveHand(SEED, CLIENT, nonce)).toBe(deriveHand(SEED, CLIENT, nonce))
    }
  })

  it('đổi bất kỳ input nào cũng đổi chuỗi kết quả', () => {
    const base = Array.from({ length: 40 }, (_, n) => deriveHand(SEED, CLIENT, n)).join('')
    const otherSeed = Array.from({ length: 40 }, (_, n) => deriveHand('a'.repeat(64), CLIENT, n)).join('')
    const otherClient = Array.from({ length: 40 }, (_, n) => deriveHand(SEED, 'khac', n)).join('')
    expect(otherSeed).not.toBe(base)
    expect(otherClient).not.toBe(base)
  })

  it('phân phối đều ba tay — kiểm định chi-square', () => {
    const counts = [0, 0, 0]
    const samples = 300_000
    for (let nonce = 0; nonce < samples; nonce++) {
      counts[deriveHand(SEED, CLIENT, nonce)]++
    }
    const expectedCount = samples / 3
    const chiSquare = counts.reduce((sum, c) => sum + (c - expectedCount) ** 2 / expectedCount, 0)
    // bậc tự do 2, ngưỡng p = 0.001 là 13.816
    expect(chiSquare).toBeLessThan(13.816)
  })

  it('GOLDEN VECTOR — không bao giờ được cập nhật snapshot này', () => {
    const hands = Array.from({ length: 20 }, (_, nonce) => deriveHand(SEED, CLIENT, nonce))
    expect(hands.join(',')).toMatchSnapshot()
  })
})
```

- [ ] **Step 6: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/fairness/derive.test.ts`
Expected: FAIL — không tìm thấy module `./derive`.

- [ ] **Step 7: Viết `derive.ts`**

```ts
// src/lib/fairness/derive.ts
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
```

- [ ] **Step 8: Chạy test để xác nhận nó pass và snapshot được tạo**

Run: `npm test -- src/lib/fairness/derive.test.ts`
Expected: PASS, 5 test. Vitest tạo file `src/lib/fairness/__snapshots__/derive.test.ts.snap`.

- [ ] **Step 9: Chạy lại để xác nhận snapshot ổn định**

Run: `npm test -- src/lib/fairness/derive.test.ts`
Expected: PASS, 0 snapshot written.

- [ ] **Step 10: Commit cả file snapshot**

```bash
git add src/lib/fairness src/lib/fairness/__snapshots__
git commit -m "feat(fairness): sinh seed, commitment và suy ra tay server không lệch"
```

---

## Task 4: Kiểm chứng một lượt và test tính chất

`verifyRun` là hàm mà cả trang `/verify` phía người chơi lẫn job đối chiếu hằng đêm đều gọi. Một hàm, hai chỗ dùng — đó là điều khiến việc kiểm chứng có ý nghĩa.

**Files:**
- Create: `src/lib/fairness/verify.ts`, `src/lib/fairness/index.ts`
- Test: `src/lib/fairness/verify.test.ts`, `src/lib/fairness/properties.test.ts`

**Interfaces:**
- Consumes: `commit` từ `./seed`, `deriveHand` từ `./derive`, `judge`/`Hand`/`Outcome` từ `@/lib/game/hands`
- Produces:
  - `interface RecordedRound { nonce: number; playerHand: Hand; serverHand: Hand; outcome: Outcome }`
  - `interface VerifyInput { serverSeed: string; clientSeed: string; commitment: string; rounds: RecordedRound[] }`
  - `interface VerifiedRound extends RecordedRound { recomputedServerHand: Hand; recomputedOutcome: Outcome; matches: boolean }`
  - `interface VerifyResult { commitmentValid: boolean; allRoundsMatch: boolean; rounds: VerifiedRound[] }`
  - `function verifyRun(input: VerifyInput): VerifyResult`

- [ ] **Step 1: Viết test cho `verifyRun`**

```ts
// src/lib/fairness/verify.test.ts
import { describe, expect, it } from 'vitest'
import { commit, generateClientSeed, generateServerSeed } from './seed'
import { deriveHand } from './derive'
import { verifyRun } from './verify'
import { judge, type Hand } from '@/lib/game/hands'

/**
 * Seed cố định: lượt dựng ra phải tất định, nếu không những test bên dưới sẽ
 * kiểm một dữ liệu khác nhau ở mỗi lần chạy CI.
 */
const FIXED_SERVER_SEED = '7b'.repeat(32)
const FIXED_CLIENT_SEED = 'hat-giong-kiem-chung'

function honestRun(roundCount: number) {
  const serverSeed = FIXED_SERVER_SEED
  const clientSeed = FIXED_CLIENT_SEED
  const rounds = Array.from({ length: roundCount }, (_, nonce) => {
    const playerHand = (nonce % 3) as Hand
    const serverHand = deriveHand(serverSeed, clientSeed, nonce)
    return { nonce, playerHand, serverHand, outcome: judge(playerHand, serverHand) }
  })
  return { serverSeed, clientSeed, commitment: commit(serverSeed), rounds }
}

describe('verifyRun', () => {
  it('xác nhận một lượt trung thực', () => {
    const result = verifyRun(honestRun(20))
    expect(result.commitmentValid).toBe(true)
    expect(result.allRoundsMatch).toBe(true)
    expect(result.rounds).toHaveLength(20)
    expect(result.rounds.every((r) => r.matches)).toBe(true)
  })

  it('bắt được commitment không khớp seed', () => {
    const run = honestRun(5)
    const result = verifyRun({ ...run, commitment: 'f'.repeat(64) })
    expect(result.commitmentValid).toBe(false)
  })

  it('bắt được tay server bị sửa trong bản ghi', () => {
    const run = honestRun(5)
    const tampered = run.rounds.map((r, i) =>
      i === 2 ? { ...r, serverHand: ((r.serverHand + 1) % 3) as Hand } : r,
    )
    const result = verifyRun({ ...run, rounds: tampered })
    expect(result.allRoundsMatch).toBe(false)
    expect(result.rounds[2].matches).toBe(false)
    expect(result.rounds[0].matches).toBe(true)
  })

  it('bắt được kết quả phân định bị sửa dù tay vẫn đúng', () => {
    const run = honestRun(20)

    // Chọn một ván có kết quả thật khác 'win', để phép sửa bên dưới luôn là một
    // thay đổi thực sự. Nếu nhắm cứng vào một chỉ số và ván đó vốn đã 'win' thì
    // "sửa" thành no-op và test đi qua mà không kiểm gì — đúng thứ nó phải bắt.
    const target = run.rounds.findIndex((r) => r.outcome !== 'win')
    expect(target).toBeGreaterThanOrEqual(0)

    const tampered = run.rounds.map((r, i) => (i === target ? { ...r, outcome: 'win' as const } : r))
    const result = verifyRun({ ...run, rounds: tampered })

    expect(result.rounds[target].matches).toBe(false)
    expect(result.allRoundsMatch).toBe(false)
  })

  it('lượt rỗng vẫn kiểm được commitment', () => {
    const run = honestRun(0)
    const result = verifyRun(run)
    expect(result.commitmentValid).toBe(true)
    expect(result.allRoundsMatch).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/fairness/verify.test.ts`
Expected: FAIL — không tìm thấy module `./verify`.

- [ ] **Step 3: Viết `verify.ts`**

```ts
// src/lib/fairness/verify.ts
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
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/fairness/verify.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Tạo `index.ts` gom export**

```ts
// src/lib/fairness/index.ts
export { commit, generateClientSeed, generateServerSeed } from './seed'
export { deriveHand } from './derive'
export {
  verifyRun,
  type RecordedRound,
  type VerifiedRound,
  type VerifyInput,
  type VerifyResult,
} from './verify'
```

- [ ] **Step 6: Viết test tính chất**

Hai test này là thứ chứng minh luật chơi thực sự công bằng 50/50 trên ván có phân định — con số mà trang thống kê công khai sẽ hiển thị.

```ts
// src/lib/fairness/properties.test.ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deriveHand } from './derive'
import { judge, type Hand } from '@/lib/game/hands'

describe('tính chất thống kê của luật chơi', () => {
  it('tỉ lệ thắng trên ván có phân định hội tụ về 50%', () => {
    fc.assert(
      fc.property(fc.hexaString({ minLength: 64, maxLength: 64 }), fc.string(), (serverSeed, clientSeed) => {
        let wins = 0
        let decided = 0
        const player: Hand = 0
        for (let nonce = 0; nonce < 60_000; nonce++) {
          const outcome = judge(player, deriveHand(serverSeed, clientSeed, nonce))
          if (outcome === 'draw') continue
          decided++
          if (outcome === 'win') wins++
        }
        const rate = wins / decided
        expect(rate).toBeGreaterThan(0.49)
        expect(rate).toBeLessThan(0.51)
      }),
      { numRuns: 3 },
    )
  })

  it('phân bố độ dài chuỗi thắng khớp đường 1/2^n', () => {
    const serverSeed = 'c'.repeat(64)
    const clientSeed = 'phan-bo-chuoi'
    const runs = 100_000
    const reached = new Array(9).fill(0) as number[]

    let nonce = 0
    for (let run = 0; run < runs; run++) {
      let streak = 0
      for (;;) {
        const outcome = judge(0, deriveHand(serverSeed, clientSeed, nonce++))
        if (outcome === 'draw') continue
        if (outcome === 'lose') break
        streak++
        if (streak >= 8) break
      }
      for (let k = 1; k <= Math.min(streak, 8); k++) reached[k]++
    }

    for (let k = 1; k <= 6; k++) {
      const ratio = reached[k + 1] / reached[k]
      expect(ratio).toBeGreaterThan(0.45)
      expect(ratio).toBeLessThan(0.55)
    }
  })
})
```

- [ ] **Step 7: Chạy test tính chất**

Run: `npm test -- src/lib/fairness/properties.test.ts`
Expected: PASS, 2 test. Chạy khoảng 10–30 giây.

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, 22 test.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fairness
git commit -m "feat(fairness): kiểm chứng lượt chơi và test tính chất thống kê"
```

---

## Task 5: Cấu hình game và mã lượt

**Files:**
- Create: `src/lib/config/game.ts`, `src/lib/run-code.ts`
- Test: `src/lib/config/game.test.ts`, `src/lib/run-code.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `interface GameConfig { targetWins: number; maxRoundsPerRun: number; attemptsPerDay: number }`
  - `function loadGameConfig(env?: Partial<NodeJS.ProcessEnv>): GameConfig` — `Partial<>` là bắt
    buộc, không phải tuỳ chọn: Next.js bổ sung `NODE_ENV` dạng **required** vào `NodeJS.ProcessEnv`
    qua `next-env.d.ts`, nên `loadGameConfig({})` trong test sẽ không biên dịch được nếu thiếu nó
  - `function generateRunCode(): string` — dạng `JKN-XXXX-XXXX`
  - `const RUN_CODE_PATTERN: RegExp`

- [ ] **Step 1: Viết test cấu hình**

```ts
// src/lib/config/game.test.ts
import { describe, expect, it } from 'vitest'
import { loadGameConfig } from './game'

describe('loadGameConfig', () => {
  it('dùng giá trị mặc định khi không có env', () => {
    expect(loadGameConfig({})).toEqual({ targetWins: 20, maxRoundsPerRun: 300, attemptsPerDay: 0 })
  })

  it('đọc được giá trị từ env', () => {
    const config = loadGameConfig({ TARGET_WINS: '5', MAX_ROUNDS_PER_RUN: '50', ATTEMPTS_PER_DAY: '3' })
    expect(config).toEqual({ targetWins: 5, maxRoundsPerRun: 50, attemptsPerDay: 3 })
  })

  it('từ chối targetWins không phải số nguyên dương', () => {
    expect(() => loadGameConfig({ TARGET_WINS: '0' })).toThrow(/TARGET_WINS/)
    expect(() => loadGameConfig({ TARGET_WINS: 'hai muoi' })).toThrow(/TARGET_WINS/)
    expect(() => loadGameConfig({ TARGET_WINS: '2.5' })).toThrow(/TARGET_WINS/)
  })

  it('từ chối trần số ván nhỏ hơn số ván cần thắng', () => {
    expect(() => loadGameConfig({ TARGET_WINS: '20', MAX_ROUNDS_PER_RUN: '10' })).toThrow(
      /MAX_ROUNDS_PER_RUN/,
    )
  })

  it('chấp nhận attemptsPerDay bằng 0 nghĩa là không giới hạn', () => {
    expect(loadGameConfig({ ATTEMPTS_PER_DAY: '0' }).attemptsPerDay).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/config/game.test.ts`
Expected: FAIL — không tìm thấy module `./game`.

- [ ] **Step 3: Viết `config/game.ts`**

```ts
// src/lib/config/game.ts
export interface GameConfig {
  targetWins: number
  maxRoundsPerRun: number
  attemptsPerDay: number
}

const DEFAULTS: GameConfig = { targetWins: 20, maxRoundsPerRun: 300, attemptsPerDay: 0 }

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
  const attemptsPerDay = readInt(env, 'ATTEMPTS_PER_DAY', DEFAULTS.attemptsPerDay, 0)

  if (maxRoundsPerRun < targetWins) {
    throw new Error(
      `MAX_ROUNDS_PER_RUN (${maxRoundsPerRun}) không được nhỏ hơn TARGET_WINS (${targetWins}) — lượt sẽ không bao giờ thắng được`,
    )
  }

  return { targetWins, maxRoundsPerRun, attemptsPerDay }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/config/game.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết test mã lượt**

```ts
// src/lib/run-code.test.ts
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
```

- [ ] **Step 6: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/run-code.test.ts`
Expected: FAIL — không tìm thấy module `./run-code`.

- [ ] **Step 7: Viết `run-code.ts`**

```ts
// src/lib/run-code.ts
import { randomBytes } from 'node:crypto'

/** Base32 Crockford — bỏ I, L, O, U để người chơi không đọc nhầm khi khiếu nại. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const RUN_CODE_PATTERN = /^JKN-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/

/** 40 bit ngẫu nhiên thành 8 ký tự. Va chạm chỉ đáng kể sau khoảng 1 triệu lượt. */
export function generateRunCode(): string {
  const bytes = randomBytes(5)
  let bits = 0n
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte)

  let chars = ''
  for (let i = 7; i >= 0; i--) {
    chars += ALPHABET[Number((bits >> BigInt(i * 5)) & 0x1fn)]
  }
  return `JKN-${chars.slice(0, 4)}-${chars.slice(4)}`
}
```

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, 30 test.

- [ ] **Step 9: Commit**

```bash
git add src/lib/config src/lib/run-code.ts src/lib/run-code.test.ts
git commit -m "feat(config): tham số game từ env và mã lượt Base32 Crockford"
```

---

## Task 6: Lược đồ cơ sở dữ liệu và hạ tầng local

Từ đây trở đi cần Postgres thật. Docker phải đang chạy trên máy.

**Files:**
- Create: `docker-compose.yml`, `drizzle.config.ts`
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`
- Create: `drizzle/0001_partial_indexes.sql`
- Test: `tests/db/schema.test.ts`, `tests/helpers/test-db.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - Bảng `players`, `runs`, `rounds`, `audit_events`
  - `type Db = PostgresJsDatabase<typeof schema>`
  - `function createDb(connectionString: string): { db: Db; close: () => Promise<void> }`
  - `function getTestDb(): Promise<Db>` · `function getTestDbUrl(): Promise<string>` ·
    `function resetTestDb(db: Db): Promise<void>` · `function stopTestDb(): Promise<void>` —
    helper dùng lại ở mọi task tích hợp sau

- [ ] **Step 1: Cài phụ thuộc test tích hợp**

```bash
npm install -D @testcontainers/postgresql testcontainers
```

- [ ] **Step 2: Tạo `docker-compose.yml` cho môi trường local**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: janken
      POSTGRES_PASSWORD: janken
      POSTGRES_DB: janken
    ports: ['5432:5432']
    volumes: ['janken-pg:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U janken']
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

volumes:
  janken-pg:
```

- [ ] **Step 3: Viết `src/lib/db/schema.ts`**

```ts
// src/lib/db/schema.ts
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const runStatusEnum = pgEnum('run_status', ['active', 'won', 'lost', 'abandoned'])
export const roundOutcomeEnum = pgEnum('round_outcome', ['win', 'lose', 'draw'])

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Chỗ nối cho đăng nhập ở v2. MVP luôn để null. */
  accountId: uuid('account_id').unique(),
  bestWins: integer('best_wins').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runCode: text('run_code').notNull().unique(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    /** Không bao giờ được trả ra ngoài khi status = 'active'. */
    serverSeed: text('server_seed').notNull(),
    commitment: text('commitment').notNull(),
    clientSeed: text('client_seed').notNull(),
    status: runStatusEnum('status').notNull().default('active'),
    wins: integer('wins').notNull().default(0),
    nextNonce: integer('next_nonce').notNull().default(0),
    /** Chụp config lúc tạo để đổi env sau này không làm hỏng lượt đang chạy. */
    targetWins: integer('target_wins').notNull(),
    maxRounds: integer('max_rounds').notNull(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_player_created_idx').on(t.playerId, t.createdAt),
    index('runs_status_ended_idx').on(t.status, t.endedAt),
  ],
)

export const rounds = pgTable(
  'rounds',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    nonce: integer('nonce').notNull(),
    playerHand: smallint('player_hand').notNull(),
    serverHand: smallint('server_hand').notNull(),
    outcome: roundOutcomeEnum('outcome').notNull(),
    requestId: text('request_id'),
    serverTs: timestamp('server_ts', { withTimezone: true }).notNull().defaultNow(),
    latencyMs: integer('latency_ms'),
  },
  // Khoá chính kép là tuyến phòng thủ chống replay ở tầng thấp nhất:
  // kể cả khi khoá dòng ở tầng ứng dụng hỏng, Postgres vẫn chặn.
  (t) => [primaryKey({ columns: [t.runId, t.nonce] })],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id'),
    runId: uuid('run_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_run_idx').on(t.runId),
    index('audit_player_created_idx').on(t.playerId, t.createdAt),
  ],
)
```

- [ ] **Step 4: Viết `src/lib/db/client.ts`**

```ts
// src/lib/db/client.ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

export function createDb(connectionString: string, max = 10) {
  const sql = postgres(connectionString, { max })
  return { db: drizzle(sql, { schema }), close: () => sql.end() }
}

let shared: { db: Db; close: () => Promise<void> } | undefined

/** Kết nối dùng chung cho runtime của app. Test luôn tự tạo kết nối riêng. */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')
    shared = createDb(url)
  }
  return shared.db
}
```

- [ ] **Step 5: Tạo `drizzle.config.ts` và sinh migration**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://janken:janken@localhost:5432/janken' },
})
```

```bash
npx drizzle-kit generate --name init
```

- [ ] **Step 6: Thêm migration viết tay cho index một-lượt-active**

Quy tắc "mỗi người chơi chỉ có một lượt `active`" phải được ép ở tầng DB, không chỉ ở tầng ứng dụng — nếu hai request tạo lượt chạy song song, chỉ tầng DB mới chặn được.

```sql
-- drizzle/0001_partial_indexes.sql
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_active_per_player
  ON runs (player_id)
  WHERE status = 'active';
```

- [ ] **Step 7: Viết helper test dùng chung**

```ts
// tests/helpers/test-db.ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/client'

let container: StartedPostgreSqlContainer | undefined
let handle: { db: Db; close: () => Promise<void> } | undefined

async function migrate(db: Db) {
  const dir = join(process.cwd(), 'drizzle')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const statements = readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')
    for (const statement of statements) {
      const trimmed = statement.trim()
      if (trimmed) await db.execute(sql.raw(trimmed))
    }
  }
}

/** Khởi động Postgres một lần cho cả file test, chạy migration, trả về db. */
export async function getTestDb(): Promise<Db> {
  if (!handle) {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
    handle = createDb(container.getConnectionUri(), 20)
    await migrate(handle.db)
  }
  return handle.db
}

/**
 * Chuỗi kết nối tới Postgres của test.
 * Test API cần giá trị này để đặt DATABASE_URL trước khi import route —
 * getDb() đọc biến môi trường ở lần gọi đầu tiên.
 */
export async function getTestDbUrl(): Promise<string> {
  await getTestDb()
  if (!container) throw new Error('container test chưa khởi động')
  return container.getConnectionUri()
}

/** Dọn sạch dữ liệu giữa các test, giữ nguyên lược đồ. */
export async function resetTestDb(db: Db) {
  await db.execute(sql`TRUNCATE audit_events, rounds, runs, players RESTART IDENTITY CASCADE`)
}

export async function stopTestDb() {
  await handle?.close()
  await container?.stop()
  handle = undefined
  container = undefined
}
```

- [ ] **Step 8: Viết test lược đồ**

```ts
// tests/db/schema.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { players, runs } from '@/lib/db/schema'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const baseRun = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('lược đồ cơ sở dữ liệu', () => {
  afterAll(stopTestDb)

  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo được người chơi với account_id null', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    expect(player.accountId).toBeNull()
    expect(player.bestWins).toBe(0)
  })

  it('chặn người chơi có hai lượt active cùng lúc', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0001' })

    await expect(
      db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0002' }),
    ).rejects.toThrow(/runs_one_active_per_player/)
  })

  it('cho phép nhiều lượt đã kết thúc trên cùng người chơi', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0003', status: 'lost' })
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0004', status: 'lost' })
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0005' })

    const all = await db.select().from(runs)
    expect(all).toHaveLength(3)
  })

  it('chặn run_code trùng nhau', async () => {
    const db = await getTestDb()
    const [a] = await db.insert(players).values({}).returning()
    const [b] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: a.id, runCode: 'JKN-DUP-0001' })

    await expect(
      db.insert(runs).values({ ...baseRun, playerId: b.id, runCode: 'JKN-DUP-0001' }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 9: Chạy test**

Run: `npm test -- tests/db/schema.test.ts`
Expected: PASS, 5 test. Lần chạy đầu mất thêm thời gian để kéo image Postgres.

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml drizzle.config.ts drizzle src/lib/db tests
git commit -m "feat(db): lược đồ Postgres, migration và hạ tầng test bằng Testcontainers"
```

---

## Task 7: Tầng repo

Nơi duy nhất trong codebase được viết SQL. Mọi hàm nhận `db` hoặc transaction làm tham số đầu tiên, để service quyết định ranh giới transaction.

**Files:**
- Create: `src/lib/repo/players.ts`, `src/lib/repo/runs.ts`, `src/lib/repo/rounds.ts`, `src/lib/repo/audit.ts`
- Test: `tests/repo/repo.test.ts`

**Interfaces:**
- Consumes: `Db` từ `@/lib/db/client`, bảng từ `@/lib/db/schema`
- Produces:
  - `type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]`
  - `createPlayer(tx: Tx): Promise<Player>`
  - `findPlayer(tx: Tx, id: string): Promise<Player | undefined>`
  - `raiseBestWins(tx: Tx, playerId: string, wins: number): Promise<void>`
  - `insertRun(tx: Tx, values: NewRun): Promise<Run>`
  - `findActiveRun(tx: Tx, playerId: string): Promise<Run | undefined>`
  - `lockRun(tx: Tx, runId: string, playerId: string): Promise<Run | undefined>`
  - `findRunByCode(tx: Tx, code: string): Promise<Run | undefined>`
  - `updateRunState(tx: Tx, runId: string, patch: RunStatePatch): Promise<void>`
  - `insertRound(tx: Tx, values: NewRound): Promise<void>`
  - `findRound(tx: Tx, runId: string, nonce: number): Promise<Round | undefined>`
  - `listRounds(tx: Tx, runId: string): Promise<Round[]>`
  - `recordAudit(tx: Tx, event: NewAuditEvent & { type: AuditType }): Promise<void>`
  - `listAuditForRun(tx: Tx, runId: string): Promise<AuditEvent[]>`

- [ ] **Step 1: Viết `src/lib/repo/players.ts`**

```ts
// src/lib/repo/players.ts
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { players } from '@/lib/db/schema'

export type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
export type Player = typeof players.$inferSelect

export async function createPlayer(tx: Tx): Promise<Player> {
  const [player] = await tx.insert(players).values({}).returning()
  return player
}

export async function findPlayer(tx: Tx, id: string): Promise<Player | undefined> {
  const [player] = await tx.select().from(players).where(eq(players.id, id)).limit(1)
  return player
}

/** Chỉ nâng lên, không bao giờ hạ xuống — best_wins là kỷ lục chứ không phải trạng thái. */
export async function raiseBestWins(tx: Tx, playerId: string, wins: number): Promise<void> {
  await tx
    .update(players)
    .set({ bestWins: sql`greatest(${players.bestWins}, ${wins})` })
    .where(eq(players.id, playerId))
}
```

- [ ] **Step 2: Viết `src/lib/repo/runs.ts`**

```ts
// src/lib/repo/runs.ts
import { and, eq } from 'drizzle-orm'
import { runs } from '@/lib/db/schema'
import type { Tx } from './players'

export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert

export interface RunStatePatch {
  status: Run['status']
  wins: number
  nextNonce: number
  endedAt: Date | null
}

export async function insertRun(tx: Tx, values: NewRun): Promise<Run> {
  const [run] = await tx.insert(runs).values(values).returning()
  return run
}

export async function findActiveRun(tx: Tx, playerId: string): Promise<Run | undefined> {
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.playerId, playerId), eq(runs.status, 'active')))
    .limit(1)
  return run
}

/**
 * Khoá dòng lượt chơi cho tới hết transaction.
 * Đây là thứ khiến hai request cùng nonce phải xếp hàng thay vì chạy song song.
 */
export async function lockRun(tx: Tx, runId: string, playerId: string): Promise<Run | undefined> {
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.playerId, playerId)))
    .limit(1)
    .for('update')
  return run
}

export async function findRunByCode(tx: Tx, code: string): Promise<Run | undefined> {
  const [run] = await tx.select().from(runs).where(eq(runs.runCode, code)).limit(1)
  return run
}

export async function updateRunState(tx: Tx, runId: string, patch: RunStatePatch): Promise<void> {
  await tx.update(runs).set(patch).where(eq(runs.id, runId))
}
```

- [ ] **Step 3: Viết `src/lib/repo/rounds.ts`**

```ts
// src/lib/repo/rounds.ts
import { and, asc, eq } from 'drizzle-orm'
import { rounds } from '@/lib/db/schema'
import type { Tx } from './players'

export type Round = typeof rounds.$inferSelect
export type NewRound = typeof rounds.$inferInsert

export async function insertRound(tx: Tx, values: NewRound): Promise<void> {
  await tx.insert(rounds).values(values)
}

export async function findRound(tx: Tx, runId: string, nonce: number): Promise<Round | undefined> {
  const [round] = await tx
    .select()
    .from(rounds)
    .where(and(eq(rounds.runId, runId), eq(rounds.nonce, nonce)))
    .limit(1)
  return round
}

export async function listRounds(tx: Tx, runId: string): Promise<Round[]> {
  return tx.select().from(rounds).where(eq(rounds.runId, runId)).orderBy(asc(rounds.nonce))
}
```

- [ ] **Step 4: Viết `src/lib/repo/audit.ts`**

```ts
// src/lib/repo/audit.ts
import { desc, eq } from 'drizzle-orm'
import { auditEvents } from '@/lib/db/schema'
import type { Tx } from './players'

export type AuditEvent = typeof auditEvents.$inferSelect
export type NewAuditEvent = typeof auditEvents.$inferInsert

export type AuditType =
  | 'run_started'
  | 'seed_revealed'
  | 'run_abandoned'
  | 'run_capped'
  | 'rate_limited'
  | 'replay_rejected'
  | 'nonce_mismatch'
  | 'run_not_active'

export async function recordAudit(tx: Tx, event: NewAuditEvent & { type: AuditType }): Promise<void> {
  await tx.insert(auditEvents).values(event)
}

export async function listAuditForRun(tx: Tx, runId: string): Promise<AuditEvent[]> {
  return tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.runId, runId))
    .orderBy(desc(auditEvents.createdAt))
}
```

- [ ] **Step 5: Viết test tầng repo**

```ts
// tests/repo/repo.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlayer, findPlayer, raiseBestWins } from '@/lib/repo/players'
import { findActiveRun, findRunByCode, insertRun, lockRun, updateRunState } from '@/lib/repo/runs'
import { findRound, insertRound, listRounds } from '@/lib/repo/rounds'
import { listAuditForRun, recordAudit } from '@/lib/repo/audit'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const seedValues = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('tầng repo', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo và đọc lại người chơi', async () => {
    const db = await getTestDb()
    const created = await createPlayer(db)
    expect(await findPlayer(db, created.id)).toMatchObject({ id: created.id, bestWins: 0 })
  })

  it('raiseBestWins chỉ nâng lên, không hạ xuống', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    await raiseBestWins(db, player.id, 7)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(7)

    await raiseBestWins(db, player.id, 3)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(7)

    await raiseBestWins(db, player.id, 12)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(12)
  })

  it('findActiveRun chỉ trả lượt đang active', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-AAAA-0001' })

    expect((await findActiveRun(db, player.id))?.id).toBe(run.id)

    await updateRunState(db, run.id, { status: 'lost', wins: 2, nextNonce: 3, endedAt: new Date() })
    expect(await findActiveRun(db, player.id)).toBeUndefined()
  })

  it('tìm được lượt theo mã', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-BBBB-0002' })
    expect((await findRunByCode(db, 'JKN-BBBB-0002'))?.runCode).toBe('JKN-BBBB-0002')
    expect(await findRunByCode(db, 'JKN-ZZZZ-9999')).toBeUndefined()
  })

  it('ghi và đọc lại ván theo đúng thứ tự nonce', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-CCCC-0003' })

    for (const nonce of [2, 0, 1]) {
      await insertRound(db, { runId: run.id, nonce, playerHand: 0, serverHand: 1, outcome: 'lose' })
    }

    expect((await listRounds(db, run.id)).map((r) => r.nonce)).toEqual([0, 1, 2])
    expect(await findRound(db, run.id, 1)).toBeDefined()
    expect(await findRound(db, run.id, 9)).toBeUndefined()
  })

  it('chặn ghi trùng nonce trong cùng một lượt', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-DDDD-0004' })

    await insertRound(db, { runId: run.id, nonce: 0, playerHand: 0, serverHand: 1, outcome: 'lose' })
    await expect(
      insertRound(db, { runId: run.id, nonce: 0, playerHand: 2, serverHand: 1, outcome: 'win' }),
    ).rejects.toThrow()
  })

  it('lockRun trả về lượt của đúng người chơi', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-LOCK-0001' })

    await db.transaction(async (tx) => {
      expect((await lockRun(tx, run.id, player.id))?.id).toBe(run.id)
    })
  })

  it('lockRun từ chối lượt của người chơi khác', async () => {
    const db = await getTestDb()
    const owner = await createPlayer(db)
    const intruder = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: owner.id, runCode: 'JKN-LOCK-0002' })

    // Không có bộ lọc playerId thì người lạ khoá và đọc được lượt của người khác
    // chỉ bằng cách đoán id — không test nào khác trong tầng này bắt được.
    await db.transaction(async (tx) => {
      expect(await lockRun(tx, run.id, intruder.id)).toBeUndefined()
    })
  })

  it('ghi và đọc lại sự kiện đối chiếu', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-EEEE-0005' })

    await recordAudit(db, { playerId: player.id, runId: run.id, type: 'run_started', payload: { nonce: 0 } })
    const events = await listAuditForRun(db, run.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('run_started')
    expect(events[0].payload).toEqual({ nonce: 0 })
  })
})
```

- [ ] **Step 6: Chạy test**

Run: `npm test -- tests/repo/repo.test.ts`
Expected: PASS, 13 test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repo tests/repo
git commit -m "feat(repo): tầng truy cập dữ liệu cho người chơi, lượt, ván và sự kiện đối chiếu"
```

---

## Task 8: Session ẩn danh có chữ ký

**Files:**
- Create: `src/lib/session/cookie.ts`
- Test: `src/lib/session/cookie.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `const SESSION_COOKIE = 'janken_pid'`
  - `function signPlayerId(playerId: string, secret: string): string`
  - `function readPlayerId(cookieValue: string | undefined, secret: string): string | null`
  - `function hashIp(ip: string, salt: string): string`

- [ ] **Step 1: Viết test**

```ts
// src/lib/session/cookie.test.ts
import { describe, expect, it } from 'vitest'
import { hashIp, readPlayerId, signPlayerId } from './cookie'

const SECRET = 'secret-du-dai-de-lam-khoa-hmac'
const PLAYER = '4f6d2c1a-0000-4000-8000-000000000001'

describe('cookie session', () => {
  it('ký rồi đọc lại ra đúng playerId', () => {
    expect(readPlayerId(signPlayerId(PLAYER, SECRET), SECRET)).toBe(PLAYER)
  })

  it('từ chối cookie bị sửa phần dữ liệu', () => {
    const signed = signPlayerId(PLAYER, SECRET)
    const [, signature] = signed.split('.')
    const forged = `${Buffer.from('4f6d2c1a-0000-4000-8000-000000000002').toString('base64url')}.${signature}`
    expect(readPlayerId(forged, SECRET)).toBeNull()
  })

  it('từ chối cookie ký bằng khoá khác', () => {
    expect(readPlayerId(signPlayerId(PLAYER, 'khoa-khac-hoan-toan'), SECRET)).toBeNull()
  })

  it('từ chối cookie rỗng hoặc sai định dạng', () => {
    expect(readPlayerId(undefined, SECRET)).toBeNull()
    expect(readPlayerId('', SECRET)).toBeNull()
    expect(readPlayerId('khong-co-dau-cham', SECRET)).toBeNull()
    expect(readPlayerId('a.b.c', SECRET)).toBeNull()
  })
})

describe('hashIp', () => {
  it('tất định và không lộ IP gốc', () => {
    const hashed = hashIp('203.0.113.9', 'muoi')
    expect(hashed).toBe(hashIp('203.0.113.9', 'muoi'))
    expect(hashed).not.toContain('203')
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('đổi muối thì đổi kết quả', () => {
    expect(hashIp('203.0.113.9', 'muoi-a')).not.toBe(hashIp('203.0.113.9', 'muoi-b'))
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/session/cookie.test.ts`
Expected: FAIL — không tìm thấy module `./cookie`.

- [ ] **Step 3: Viết `cookie.ts`**

```ts
// src/lib/session/cookie.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'janken_pid'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signPlayerId(playerId: string, secret: string): string {
  const payload = Buffer.from(playerId, 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readPlayerId(cookieValue: string | undefined, secret: string): string | null {
  if (!cookieValue) return null

  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  const expected = Buffer.from(sign(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  return Buffer.from(payload, 'base64url').toString('utf8')
}

/** Lưu IP đã băm thay vì IP thô — vẫn nhóm được hành vi mà không giữ dữ liệu cá nhân. */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex')
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/session/cookie.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session
git commit -m "feat(session): cookie ẩn danh có chữ ký và băm IP"
```

---

## Task 9: Nhật ký có cấu trúc và redaction

Test quan trọng nhất của task này không phải là "log ra đúng chữ" mà là **`serverSeed` không lọt vào log kể cả khi ai đó vô ý log nguyên object lượt chơi**.

**Files:**
- Create: `src/lib/observability/logger.ts`, `src/lib/observability/request-context.ts`
- Test: `src/lib/observability/logger.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `const logger: Logger` — instance Pino gốc
  - `function getLogger(): Logger` — logger đã gắn sẵn khoá tương quan của request hiện tại
  - `interface RequestContext { requestId: string; playerId?: string; runId?: string; nonce?: number }`
  - `function runWithContext<T>(ctx: RequestContext, fn: () => T): T`
  - `function setContext(patch: Partial<RequestContext>): void`
  - `function currentRequestId(): string | undefined`
  - `function getContext(): RequestContext | undefined`

- [ ] **Step 1: Viết test**

```ts
// src/lib/observability/logger.test.ts
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import pino from 'pino'
import { REDACT_PATHS } from './logger'
import { currentRequestId, getContext, runWithContext, setContext } from './request-context'

function captureLines(): { lines: string[]; stream: Writable } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { lines, stream }
}

describe('redaction', () => {
  it('không để serverSeed lọt ra log dù log nguyên object lượt chơi', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info({ run: { id: 'r1', serverSeed: 'DEADBEEF'.repeat(8), commitment: 'ab' } }, 'bắt đầu lượt')

    const output = lines.join('')
    expect(output).not.toContain('DEADBEEF')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('"commitment":"ab"')
  })

  it('che serverSeed ở cả cấp cao nhất lẫn trong mảng rounds', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info({ serverSeed: 'AAAA1111', result: { serverSeed: 'BBBB2222' } }, 'kết quả')

    const output = lines.join('')
    expect(output).not.toContain('AAAA1111')
    expect(output).not.toContain('BBBB2222')
  })

  it('che cả những hình dạng lồng sâu và mảng mà các test trên không chạm tới', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info(
      {
        a: { b: { serverSeed: 'HAI-CAP' } },
        c: { d: { e: { serverSeed: 'BA-CAP' } } },
        rounds: [{ nonce: 0, serverSeed: 'TRONG-MANG' }],
      },
      'các hình dạng lồng',
    )

    const output = lines.join('')
    expect(output).not.toContain('HAI-CAP')
    expect(output).not.toContain('BA-CAP')
    expect(output).not.toContain('TRONG-MANG')
  })

  it('redaction sống sót qua logger con — đây mới là lối gọi thật', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    // getLogger() gắn context bằng logger.child(), nên phải chứng minh việc che
    // vẫn còn tác dụng sau khi tạo con, không chỉ trên logger gốc.
    log.child({ requestId: 'req-1' }).info({ run: { serverSeed: 'QUA-CON' } }, 'qua con')

    expect(lines.join('')).not.toContain('QUA-CON')
  })
})

describe('request context', () => {
  it('giữ requestId trong suốt lời gọi bất đồng bộ', async () => {
    await runWithContext({ requestId: 'req-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(currentRequestId()).toBe('req-1')
    })
  })

  it('hai context chạy song song không lẫn vào nhau', async () => {
    const seen: string[] = []
    await Promise.all([
      runWithContext({ requestId: 'a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        seen.push(currentRequestId() ?? 'khong-co')
      }),
      runWithContext({ requestId: 'b' }, async () => {
        seen.push(currentRequestId() ?? 'khong-co')
      }),
    ])
    expect(seen.sort()).toEqual(['a', 'b'])
  })

  it('setContext bổ sung khoá vào context đang chạy', () => {
    runWithContext({ requestId: 'req-2' }, () => {
      setContext({ runId: 'run-9', nonce: 3 })

      // Phải đọc lại đúng những khoá vừa vá. Chỉ kiểm requestId không đổi thì
      // setContext có là hàm rỗng test vẫn xanh — nó không kiểm gì cả.
      expect(getContext()).toEqual({ requestId: 'req-2', runId: 'run-9', nonce: 3 })
    })
  })

  it('setContext ngoài context không nổ và không tạo context mới', () => {
    expect(() => setContext({ runId: 'run-lac' })).not.toThrow()
    expect(getContext()).toBeUndefined()
  })

  it('ngoài context thì không có requestId', () => {
    expect(currentRequestId()).toBeUndefined()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/observability/logger.test.ts`
Expected: FAIL — không tìm thấy module `./logger`.

- [ ] **Step 3: Viết `request-context.ts`**

```ts
// src/lib/observability/request-context.ts
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  requestId: string
  playerId?: string
  runId?: string
  nonce?: number
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Chạy một request trong context riêng. Mọi dòng log bên trong tự mang đủ khoá
 * tương quan mà không phải truyền tay qua từng hàm.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run({ ...context }, fn)
}

export function setContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore()
  if (current) Object.assign(current, patch)
}

export function getContext(): RequestContext | undefined {
  return storage.getStore()
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}
```

- [ ] **Step 4: Viết `logger.ts`**

```ts
// src/lib/observability/logger.ts
import pino, { type Logger } from 'pino'
import { getContext } from './request-context'

/**
 * serverSeed không bao giờ được xuất hiện trong log khi lượt còn active.
 * Khai báo ở cấp logger để nó không lọt ra kể cả khi ai đó vô ý log nguyên object.
 * Thêm đường dẫn mới vào đây ngay khi có chỗ mới có thể chứa seed.
 */
export const REDACT_PATHS = [
  'serverSeed',
  '*.serverSeed',
  '*.*.serverSeed',
  '*.*.*.serverSeed',
  'run.serverSeed',
  'result.serverSeed',
  'rounds[*].serverSeed',
]

/**
 * Trần lồng: danh sách trên phủ tối đa 3 cấp khoá tuỳ ý. Lồng sâu hơn — ví dụ
 * log nguyên một object request đã bọc nhiều lớp — sẽ để seed lọt ra nguyên văn.
 * Đừng log nguyên object thô nhiều lớp; lấy đúng trường cần rồi hãy log.
 */

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'janken' },
})

/** Logger đã gắn sẵn khoá tương quan của request hiện tại. */
export function getLogger(): Logger {
  const context = getContext()
  return context ? logger.child({ ...context }) : logger
}
```

- [ ] **Step 5: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/observability/logger.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/observability
git commit -m "feat(observability): logger có cấu trúc, redaction seed và request context"
```

---

## Task 10: Lỗi có kiểu và service tạo lượt

Điểm tinh tế của task này: **sự kiện đối chiếu của một request bị từ chối không được ghi bên trong transaction sẽ bị rollback cùng lỗi**. Mà đó lại chính là sự kiện quan trọng nhất cần giữ. Nên lỗi mang theo payload audit, và người gọi ghi audit trong một transaction riêng sau khi transaction chính đã rollback.

**Files:**
- Create: `src/lib/services/errors.ts`, `src/lib/services/start-run.ts`
- Test: `tests/services/start-run.test.ts`

**Interfaces:**
- Consumes: repo, `loadGameConfig`, `generateServerSeed`/`generateClientSeed`/`commit`, `generateRunCode`
- Produces:
  - `class ServiceError extends Error { code; httpStatus; audit? }`
  - `class ConflictError extends ServiceError`, `class NotFoundError extends ServiceError`, `class RateLimitedError extends ServiceError`
  - `function recordRejection(db: Db, error: ServiceError): Promise<void>`
  - `interface StartRunInput { db: Db; playerId: string; clientSeed?: string; ipHash?: string; userAgent?: string; requestId?: string; config?: GameConfig }`
  - `interface StartRunResult { runId: string; runCode: string; commitment: string; clientSeed: string; targetWins: number; wins: number; nextNonce: number; resumed: boolean }`
  - `function startRun(input: StartRunInput): Promise<StartRunResult>`

- [ ] **Step 1: Viết `errors.ts`**

```ts
// src/lib/services/errors.ts
import type { Db } from '@/lib/db/client'
import { recordAudit, type AuditType } from '@/lib/repo/audit'

export interface AuditPayload {
  type: AuditType
  playerId?: string
  runId?: string
  requestId?: string
  payload?: Record<string, unknown>
}

export class ServiceError extends Error {
  /** Đặt true sau khi audit đã được ghi, để không ghi hai lần khi lỗi đi qua nhiều lớp. */
  audited = false

  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly audit?: AuditPayload,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, audit?: AuditPayload) {
    super('not_found', 404, message, audit)
  }
}

export class ConflictError extends ServiceError {
  constructor(code: string, message: string, audit?: AuditPayload) {
    super(code, 409, message, audit)
  }
}

export class RateLimitedError extends ServiceError {
  constructor(message: string, audit?: AuditPayload) {
    super('rate_limited', 429, message, audit)
  }
}

/**
 * Ghi sự kiện đối chiếu của một request bị từ chối.
 *
 * Phải gọi NGOÀI transaction đã rollback. Nếu ghi bên trong, rollback cuốn luôn
 * bản ghi audit — và mất đúng thứ cần nhất khi người chơi khiếu nại "tôi bấm mà
 * không ăn".
 *
 * CẢNH BÁO: kiểu `Db` ở đây KHÔNG chặn được việc truyền nhầm một transaction
 * handle. Drizzle định nghĩa transaction kế thừa từ cùng lớp cơ sở, nên
 * `recordRejection(tx, err)` biên dịch trót lọt và âm thầm ghi audit vào đúng
 * transaction sắp bị rollback. Luôn truyền kết nối gốc: `input.db` hoặc `getDb()`.
 * Test "ghi audit dù transaction đã rollback" ở tầng service là chốt chặn thật
 * cho quy tắc này.
 */
export async function recordRejection(db: Db, error: ServiceError): Promise<void> {
  if (!error.audit || error.audited) return

  await recordAudit(db, {
    type: error.audit.type,
    playerId: error.audit.playerId ?? null,
    runId: error.audit.runId ?? null,
    requestId: error.audit.requestId ?? null,
    payload: error.audit.payload ?? {},
  })

  // Đặt cờ SAU khi ghi xong. Đặt trước thì một lần ghi hỏng sẽ để lại cờ đã bật
  // mà không có bản ghi nào, và mọi lớp phía sau đều bỏ qua — mất luôn sự kiện
  // quan trọng nhất thay vì có cơ hội ghi lại.
  error.audited = true
}
```

- [ ] **Step 2: Viết test cho `startRun`**

```ts
// tests/services/start-run.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { commit } from '@/lib/fairness'
import { createPlayer } from '@/lib/repo/players'
import { listAuditForRun } from '@/lib/repo/audit'
import { updateRunState } from '@/lib/repo/runs'
import { RUN_CODE_PATTERN } from '@/lib/run-code'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const config = { targetWins: 20, maxRoundsPerRun: 300, attemptsPerDay: 0 }

describe('startRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo lượt mới với commitment khớp seed đã lưu', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const result = await startRun({ db, playerId: player.id, config })

    expect(result.runCode).toMatch(RUN_CODE_PATTERN)
    expect(result.commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(result.targetWins).toBe(20)
    expect(result.wins).toBe(0)
    expect(result.nextNonce).toBe(0)
    expect(result.resumed).toBe(false)

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(commit(run.serverSeed)).toBe(result.commitment)
  })

  it('không bao giờ trả serverSeed ra ngoài', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config })

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(Object.keys(result)).not.toContain('serverSeed')
    expect(JSON.stringify(result)).not.toContain(run.serverSeed)
  })

  it('dùng clientSeed người chơi tự nhập', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, clientSeed: 'toi-tu-chon-cai-nay', config })
    expect(result.clientSeed).toBe('toi-tu-chon-cai-nay')
  })

  it('sinh clientSeed ngẫu nhiên khi người chơi không nhập', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config })
    expect(result.clientSeed).toMatch(/^[0-9a-f]{32}$/)
  })

  it('gọi lại khi đang có lượt dở thì trả lại lượt đó, không tạo mới', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const first = await startRun({ db, playerId: player.id, config })
    const second = await startRun({ db, playerId: player.id, clientSeed: 'seed-khac', config })

    expect(second.runId).toBe(first.runId)
    expect(second.clientSeed).toBe(first.clientSeed)
    expect(second.resumed).toBe(true)

    // Nhánh resume dựng object trả về riêng, không dùng chung code với nhánh tạo
    // mới, nên phải tự chứng minh nó cũng không rò seed.
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, first.runId) })
    expect(JSON.stringify(second)).not.toContain(row.serverSeed)

    const all = await db.query.runs.findMany()
    expect(all).toHaveLength(1)
  })

  it('tạo được lượt mới sau khi lượt cũ đã kết thúc', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const first = await startRun({ db, playerId: player.id, config })
    await updateRunState(db, first.runId, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
    const second = await startRun({ db, playerId: player.id, config })

    expect(second.runId).not.toBe(first.runId)
    expect(second.resumed).toBe(false)
  })

  it('seed của hai lượt liên tiếp không bao giờ trùng nhau', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const seeds = new Set<string>()

    for (let i = 0; i < 20; i++) {
      const result = await startRun({ db, playerId: player.id, config })
      const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
      seeds.add(run.serverSeed)
      await updateRunState(db, result.runId, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
    }
    expect(seeds.size).toBe(20)
  })

  it('ghi sự kiện run_started', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config, requestId: 'req-abc' })

    const events = await listAuditForRun(db, result.runId)
    expect(events.map((e) => e.type)).toContain('run_started')
    expect(events[0].requestId).toBe('req-abc')
  })

  it('chụp lại targetWins và maxRounds tại thời điểm tạo', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({
      db,
      playerId: player.id,
      config: { targetWins: 5, maxRoundsPerRun: 50, attemptsPerDay: 0 },
    })

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(run.targetWins).toBe(5)
    expect(run.maxRounds).toBe(50)
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận nó fail**

Run: `npm test -- tests/services/start-run.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/services/start-run`.

- [ ] **Step 4: Viết `start-run.ts`**

```ts
// src/lib/services/start-run.ts
import type { Db } from '@/lib/db/client'
import { loadGameConfig, type GameConfig } from '@/lib/config/game'
import { commit, generateClientSeed, generateServerSeed } from '@/lib/fairness'
import { recordAudit } from '@/lib/repo/audit'
import { findActiveRun, insertRun } from '@/lib/repo/runs'
import { generateRunCode } from '@/lib/run-code'

export interface StartRunInput {
  db: Db
  playerId: string
  clientSeed?: string
  ipHash?: string
  userAgent?: string
  requestId?: string
  config?: GameConfig
}

export interface StartRunResult {
  runId: string
  runCode: string
  commitment: string
  clientSeed: string
  targetWins: number
  wins: number
  nextNonce: number
  resumed: boolean
}

export const MAX_CLIENT_SEED_LENGTH = 128

/**
 * Tạo lượt mới, hoặc trả lại lượt đang dở.
 *
 * Mỗi người chơi chỉ được có một lượt active — quy tắc này còn được ép ở tầng DB
 * bằng partial unique index, nên hai request song song không thể cùng tạo lượt.
 */
export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const config = input.config ?? loadGameConfig()

  return input.db.transaction(async (tx) => {
    const existing = await findActiveRun(tx, input.playerId)
    if (existing) {
      return {
        runId: existing.id,
        runCode: existing.runCode,
        commitment: existing.commitment,
        clientSeed: existing.clientSeed,
        targetWins: existing.targetWins,
        wins: existing.wins,
        nextNonce: existing.nextNonce,
        resumed: true,
      }
    }

    const serverSeed = generateServerSeed()
    const clientSeed = (input.clientSeed ?? '').trim().slice(0, MAX_CLIENT_SEED_LENGTH) || generateClientSeed()

    const run = await insertRun(tx, {
      runCode: generateRunCode(),
      playerId: input.playerId,
      serverSeed,
      commitment: commit(serverSeed),
      clientSeed,
      targetWins: config.targetWins,
      maxRounds: config.maxRoundsPerRun,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
    })

    await recordAudit(tx, {
      type: 'run_started',
      playerId: input.playerId,
      runId: run.id,
      requestId: input.requestId ?? null,
      payload: { commitment: run.commitment, targetWins: run.targetWins },
    })

    return {
      runId: run.id,
      runCode: run.runCode,
      commitment: run.commitment,
      clientSeed: run.clientSeed,
      targetWins: run.targetWins,
      wins: 0,
      nextNonce: 0,
      resumed: false,
    }
  })
}
```

- [ ] **Step 5: Chạy test để xác nhận nó pass**

Run: `npm test -- tests/services/start-run.test.ts`
Expected: PASS, 13 test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services tests/services
git commit -m "feat(services): lỗi có kiểu mang payload audit và service tạo lượt"
```

---

## Task 11: Service chơi một ván

Task quan trọng nhất của cả dự án. Bốn thứ phải đúng cùng lúc: ván được ghi nguyên tử để không ai bỏ được ván thua, nonce đúng thứ tự, retry của mạng lỗi được phân biệt với replay gian lận, và seed chỉ lộ khi lượt đã kết thúc.

**Files:**
- Create: `src/lib/services/play-round.ts`, `src/lib/services/abandon-run.ts`
- Test: `tests/services/play-round.test.ts`

**Interfaces:**
- Consumes: `lockRun`/`updateRunState` từ repo/runs, `findRound`/`insertRound` từ repo/rounds, `recordAudit`, `raiseBestWins`, `deriveHand`, `judge`, `applyOutcome`, `ConflictError`/`NotFoundError`/`recordRejection`
- Produces:
  - `interface PlayRoundInput { db: Db; runId: string; playerId: string; hand: Hand; nonce: number; requestId?: string; latencyMs?: number }`
  - `interface PlayRoundResult { nonce: number; playerHand: Hand; serverHand: Hand; outcome: Outcome; wins: number; status: RunStatus; targetWins: number; serverSeed?: string; replayed: boolean }`
  - `function playRound(input: PlayRoundInput): Promise<PlayRoundResult>`
  - `function abandonRun(input: { db: Db; runId: string; playerId: string; requestId?: string }): Promise<{ status: 'abandoned'; serverSeed: string; wins: number }>`

- [ ] **Step 1: Viết test**

```ts
// tests/services/play-round.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import { judge, type Hand } from '@/lib/game/hands'
import { listAuditForRun } from '@/lib/repo/audit'
import { createPlayer, findPlayer } from '@/lib/repo/players'
import { listRounds } from '@/lib/repo/rounds'
import { lockRun } from '@/lib/repo/runs'
import { abandonRun } from '@/lib/services/abandon-run'
import { playRound } from '@/lib/services/play-round'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'
import type { Db } from '@/lib/db/client'

const config = { targetWins: 20, maxRoundsPerRun: 300, attemptsPerDay: 0 }
const shortConfig = { targetWins: 2, maxRoundsPerRun: 4, attemptsPerDay: 0 }

/** Chuẩn bị một lượt và trả kèm hàm tính tay thắng/thua/hòa cho từng nonce. */
async function setup(db: Db, cfg = config) {
  const player = await createPlayer(db)
  const run = await startRun({ db, playerId: player.id, config: cfg })
  const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

  const serverHandAt = (nonce: number) => deriveHand(row.serverSeed, row.clientSeed, nonce)
  const handThatBeats = (nonce: number) => (((serverHandAt(nonce) + 1) % 3) as Hand)
  const handThatLoses = (nonce: number) => (((serverHandAt(nonce) + 2) % 3) as Hand)
  const handThatDraws = (nonce: number) => serverHandAt(nonce)

  return { player, run, row, serverHandAt, handThatBeats, handThatLoses, handThatDraws }
}

describe('playRound', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('ván thắng thì tăng chuỗi và lượt vẫn active', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })

    expect(result.outcome).toBe('win')
    expect(result.wins).toBe(1)
    expect(result.status).toBe('active')
    expect(result.serverSeed).toBeUndefined()
  })

  it('ván hòa thì giữ chuỗi nhưng vẫn tiêu một nonce', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatDraws(0), nonce: 0 })

    expect(result.outcome).toBe('draw')
    expect(result.wins).toBe(0)
    expect(result.status).toBe('active')
    expect(result.serverSeed).toBeUndefined()
  })

  it('ván thua thì kết thúc lượt và lộ seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatLoses } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    expect(result.outcome).toBe('lose')
    expect(result.status).toBe('lost')
    expect(result.serverSeed).toBe(row.serverSeed)
  })

  it('thắng đủ targetWins thì thắng lượt và lộ seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatBeats, serverHandAt } = await setup(db, shortConfig)

    let nonce = 0
    let wins = 0
    let last
    while (wins < 2) {
      const hand = handThatBeats(nonce)
      last = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce })
      expect(judge(hand, serverHandAt(nonce))).toBe('win')
      wins = last.wins
      nonce++
    }

    expect(last?.status).toBe('won')
    expect(last?.serverSeed).toBe(row.serverSeed)
  })

  it('cập nhật best_wins của người chơi khi lượt kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })
    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(1), nonce: 1 })
    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(2), nonce: 2 })

    expect((await findPlayer(db, player.id))?.bestWins).toBe(2)
  })

  it('từ chối nonce vượt trước và ghi audit dù transaction đã rollback', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(5), nonce: 5 }),
    ).rejects.toMatchObject({ code: 'nonce_mismatch', httpStatus: 409 })

    const events = await listAuditForRun(db, run.runId)
    expect(events.map((e) => e.type)).toContain('nonce_mismatch')
    expect(await listRounds(db, run.runId)).toHaveLength(0)
  })

  it('gửi lại đúng nonce với đúng tay thì trả kết quả cũ, không sinh ván mới', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)
    const hand = handThatBeats(0)

    const first = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })
    const retry = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })

    expect(retry.outcome).toBe(first.outcome)
    expect(retry.serverHand).toBe(first.serverHand)
    expect(retry.wins).toBe(first.wins)
    expect(retry.replayed).toBe(true)
    expect(await listRounds(db, run.runId)).toHaveLength(1)
  })

  it('gửi lại đúng nonce với tay khác thì bị từ chối và ghi audit', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 }),
    ).rejects.toMatchObject({ code: 'replay_rejected', httpStatus: 409 })

    const events = await listAuditForRun(db, run.runId)
    expect(events.map((e) => e.type)).toContain('replay_rejected')
    expect(await listRounds(db, run.runId)).toHaveLength(1)
  })

  it('retry ván cuối của lượt đã kết thúc vẫn trả lại seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatLoses } = await setup(db)
    const hand = handThatLoses(0)

    await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })
    const retry = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })

    expect(retry.status).toBe('lost')
    expect(retry.serverSeed).toBe(row.serverSeed)
    expect(retry.replayed).toBe(true)
  })

  it('từ chối chơi tiếp trên lượt đã kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatLoses, handThatBeats } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(1), nonce: 1 }),
    ).rejects.toMatchObject({ code: 'run_not_active' })
  })

  it('từ chối lượt của người chơi khác', async () => {
    const db = await getTestDb()
    const { run, handThatBeats } = await setup(db)
    const intruder = await createPlayer(db)

    await expect(
      playRound({ db, runId: run.runId, playerId: intruder.id, hand: handThatBeats(0), nonce: 0 }),
    ).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('hai mươi request đồng thời cùng nonce chỉ ghi đúng một ván', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db)
    const hand = handThatDraws(0)

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 }),
      ),
    )

    expect(await listRounds(db, run.runId)).toHaveLength(1)
    expect(new Set(results.map((r) => r.serverHand)).size).toBe(1)
    expect(new Set(results.map((r) => r.outcome)).size).toBe(1)
    expect(results.filter((r) => !r.replayed)).toHaveLength(1)
  })

  it('khoá dòng buộc transaction thứ hai chờ transaction thứ nhất commit', async () => {
    const db = await getTestDb()
    const { player, run } = await setup(db)
    const HOLD_MS = 300

    // Test 20-request bên dưới chứng minh kết quả cuối cùng đúng, nhưng nó dựa vào
    // may rủi của event loop: gỡ .for('update') ra thì nó vẫn xanh khoảng 9 lần
    // trên 10. Test này đo thẳng chính hành vi chặn, nên một regression làm rơi
    // row lock sẽ đỏ mọi lần chứ không phải thỉnh thoảng.
    let releasedAt = 0
    let acquiredAt = 0

    const holder = db.transaction(async (tx) => {
      await lockRun(tx, run.runId, player.id)
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
      releasedAt = Date.now()
    })

    // Cho holder kịp cầm khoá trước khi waiter thử.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const waiter = db.transaction(async (tx) => {
      await lockRun(tx, run.runId, player.id)
      acquiredAt = Date.now()
    })

    await Promise.all([holder, waiter])

    // Không có khoá thì waiter lấy được ngay, tức acquiredAt < releasedAt.
    expect(acquiredAt).toBeGreaterThanOrEqual(releasedAt)
  })

  it('chạm trần số ván thì đóng lượt với abandoned và ghi run_capped', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db, shortConfig)

    let last
    for (let nonce = 0; nonce < 4; nonce++) {
      last = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatDraws(nonce), nonce })
    }

    expect(last?.status).toBe('abandoned')
    expect(last?.serverSeed).toBeDefined()
    expect((await listAuditForRun(db, run.runId)).map((e) => e.type)).toContain('run_capped')
  })

  it('ghi lại requestId và tay của cả hai bên vào bản ghi ván', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, serverHandAt } = await setup(db)

    await playRound({
      db,
      runId: run.runId,
      playerId: player.id,
      hand: handThatBeats(0),
      nonce: 0,
      requestId: 'req-xyz',
      latencyMs: 12,
    })

    const [round] = await listRounds(db, run.runId)
    expect(round.requestId).toBe('req-xyz')
    expect(round.latencyMs).toBe(12)
    expect(round.playerHand).toBe(handThatBeats(0))
    expect(round.serverHand).toBe(serverHandAt(0))
  })
})

describe('abandonRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('đóng lượt, lộ seed và ghi audit', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatBeats } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })
    const result = await abandonRun({ db, runId: run.runId, playerId: player.id })

    expect(result.status).toBe('abandoned')
    expect(result.serverSeed).toBe(row.serverSeed)
    expect(result.wins).toBe(1)

    const types = (await listAuditForRun(db, run.runId)).map((e) => e.type)
    expect(types).toContain('run_abandoned')
    // Bỏ lượt cũng làm seed lộ ra, nên nó phải để lại dấu như mọi đường kết thúc khác.
    expect(types).toContain('seed_revealed')
  })

  it('từ chối bỏ một lượt đã kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })
    await expect(abandonRun({ db, runId: run.runId, playerId: player.id })).rejects.toMatchObject({
      code: 'run_not_active',
    })
  })

  it('bỏ lượt xong thì tạo được lượt mới', async () => {
    const db = await getTestDb()
    const { player, run } = await setup(db)

    await abandonRun({ db, runId: run.runId, playerId: player.id })
    const next = await startRun({ db, playerId: player.id, config })

    expect(next.runId).not.toBe(run.runId)
    expect(next.resumed).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- tests/services/play-round.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/services/play-round`.

- [ ] **Step 3: Viết `play-round.ts`**

```ts
// src/lib/services/play-round.ts
import type { Db } from '@/lib/db/client'
import { deriveHand } from '@/lib/fairness'
import { judge, type Hand, type Outcome } from '@/lib/game/hands'
import { applyOutcome, type RunStatus } from '@/lib/game/run-state'
import { recordAudit } from '@/lib/repo/audit'
import { raiseBestWins } from '@/lib/repo/players'
import { findRound, insertRound } from '@/lib/repo/rounds'
import { lockRun, updateRunState } from '@/lib/repo/runs'
import { getLogger } from '@/lib/observability/logger'
import { ConflictError, NotFoundError, ServiceError, recordRejection } from './errors'

export interface PlayRoundInput {
  db: Db
  runId: string
  playerId: string
  hand: Hand
  nonce: number
  requestId?: string
  latencyMs?: number
}

export interface PlayRoundResult {
  nonce: number
  playerHand: Hand
  serverHand: Hand
  outcome: Outcome
  wins: number
  status: RunStatus
  targetWins: number
  /** Chỉ có mặt khi lượt đã kết thúc. Không bao giờ trả khi status = 'active'. */
  serverSeed?: string
  replayed: boolean
}

export async function playRound(input: PlayRoundInput): Promise<PlayRoundResult> {
  try {
    return await runInTransaction(input)
  } catch (error) {
    // Transaction đã rollback, nên audit của request bị từ chối phải ghi ở đây.
    // Bọc catch: nếu ghi audit hỏng, lỗi ghi KHÔNG được thay chỗ ServiceError gốc —
    // người chơi phải nhận đúng 409 chứ không phải 500 vì một sự cố ghi nhật ký.
    if (error instanceof ServiceError) {
      await recordRejection(input.db, error).catch((failure) =>
        getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
      )
    }
    throw error
  }
}

async function runInTransaction(input: PlayRoundInput): Promise<PlayRoundResult> {
  const { db, runId, playerId, hand, nonce } = input

  return db.transaction(async (tx) => {
    const run = await lockRun(tx, runId, playerId)
    if (!run) {
      throw new NotFoundError('không tìm thấy lượt chơi')
    }

    const auditBase = { playerId, runId, requestId: input.requestId }

    // Nonce đã chơi rồi: có thể là retry chính đáng của mạng lỗi, có thể là gian lận.
    // Phân biệt bằng tay đã đánh. Kiểm tra này phải đứng TRƯỚC kiểm tra status,
    // để retry ván cuối của một lượt vừa kết thúc vẫn nhận lại được kết quả.
    if (nonce < run.nextNonce) {
      const existing = await findRound(tx, runId, nonce)

      if (existing && existing.playerHand === hand) {
        return {
          nonce,
          playerHand: hand,
          serverHand: existing.serverHand as Hand,
          outcome: existing.outcome,
          wins: run.wins,
          status: run.status,
          targetWins: run.targetWins,
          serverSeed: run.status === 'active' ? undefined : run.serverSeed,
          replayed: true,
        }
      }

      throw new ConflictError('replay_rejected', 'ván này đã chơi rồi với tay khác', {
        ...auditBase,
        type: 'replay_rejected',
        payload: { nonce, submittedHand: hand, recordedHand: existing?.playerHand ?? null },
      })
    }

    if (nonce > run.nextNonce) {
      throw new ConflictError('nonce_mismatch', 'sai thứ tự ván', {
        ...auditBase,
        type: 'nonce_mismatch',
        payload: { nonce, expected: run.nextNonce },
      })
    }

    if (run.status !== 'active') {
      throw new ConflictError('run_not_active', `lượt đã kết thúc (${run.status})`, {
        ...auditBase,
        type: 'run_not_active',
        payload: { nonce, status: run.status },
      })
    }

    const serverHand = deriveHand(run.serverSeed, run.clientSeed, nonce)
    const outcome = judge(hand, serverHand)
    const next = applyOutcome(
      { status: 'active', wins: run.wins, nextNonce: run.nextNonce },
      outcome,
      { targetWins: run.targetWins, maxRounds: run.maxRounds },
    )

    await insertRound(tx, {
      runId,
      nonce,
      playerHand: hand,
      serverHand,
      outcome,
      requestId: input.requestId ?? null,
      latencyMs: input.latencyMs ?? null,
    })

    const ended = next.status !== 'active'
    await updateRunState(tx, runId, {
      status: next.status,
      wins: next.wins,
      nextNonce: next.nextNonce,
      endedAt: ended ? new Date() : null,
    })

    if (ended) {
      await raiseBestWins(tx, playerId, next.wins)
      await recordAudit(tx, {
        ...auditBase,
        type: 'seed_revealed',
        payload: { status: next.status, wins: next.wins, rounds: next.nextNonce },
      })
      if (next.status === 'abandoned') {
        await recordAudit(tx, {
          ...auditBase,
          type: 'run_capped',
          payload: { maxRounds: run.maxRounds, wins: next.wins },
        })
      }
    }

    return {
      nonce,
      playerHand: hand,
      serverHand,
      outcome,
      wins: next.wins,
      status: next.status,
      targetWins: run.targetWins,
      serverSeed: ended ? run.serverSeed : undefined,
      replayed: false,
    }
  })
}
```

- [ ] **Step 4: Viết `abandon-run.ts`**

```ts
// src/lib/services/abandon-run.ts
import type { Db } from '@/lib/db/client'
import { recordAudit } from '@/lib/repo/audit'
import { raiseBestWins } from '@/lib/repo/players'
import { lockRun, updateRunState } from '@/lib/repo/runs'
import { getLogger } from '@/lib/observability/logger'
import { ConflictError, NotFoundError, ServiceError, recordRejection } from './errors'

export interface AbandonRunInput {
  db: Db
  runId: string
  playerId: string
  requestId?: string
}

export interface AbandonRunResult {
  status: 'abandoned'
  serverSeed: string
  wins: number
}

/**
 * Bỏ lượt giữa chừng và lộ seed ngay, để người chơi vẫn kiểm chứng được.
 * Bỏ lượt không mang lại lợi thế nào — lượt mới có seed mới ngẫu nhiên —
 * nên không cần chống lạm dụng.
 */
export async function abandonRun(input: AbandonRunInput): Promise<AbandonRunResult> {
  try {
    return await input.db.transaction(async (tx) => {
      const run = await lockRun(tx, input.runId, input.playerId)
      if (!run) throw new NotFoundError('không tìm thấy lượt chơi')

      if (run.status !== 'active') {
        throw new ConflictError('run_not_active', `lượt đã kết thúc (${run.status})`, {
          type: 'run_not_active',
          playerId: input.playerId,
          runId: input.runId,
          requestId: input.requestId,
          payload: { status: run.status },
        })
      }

      await updateRunState(tx, run.id, {
        status: 'abandoned',
        wins: run.wins,
        nextNonce: run.nextNonce,
        endedAt: new Date(),
      })
      await raiseBestWins(tx, input.playerId, run.wins)

      // Ghi cả hai: `run_abandoned` nói vì sao lượt kết thúc, `seed_revealed` đánh
      // dấu thời điểm seed trở nên biết được. Thiếu sự kiện thứ hai thì một truy vấn
      // `type = 'seed_revealed'` để dựng lại mọi lần seed lộ ra sẽ bỏ sót đúng
      // đường này, dù seed ở đây cũng lộ y như khi thua hay thắng.
      const auditBase = {
        playerId: input.playerId,
        runId: run.id,
        requestId: input.requestId ?? null,
      }
      await recordAudit(tx, {
        ...auditBase,
        type: 'run_abandoned',
        payload: { wins: run.wins, rounds: run.nextNonce },
      })
      await recordAudit(tx, {
        ...auditBase,
        type: 'seed_revealed',
        payload: { status: 'abandoned', wins: run.wins, rounds: run.nextNonce },
      })

      return { status: 'abandoned' as const, serverSeed: run.serverSeed, wins: run.wins }
    })
  } catch (error) {
    if (error instanceof ServiceError) {
      await recordRejection(input.db, error).catch((failure) =>
        getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
      )
    }
    throw error
  }
}
```

- [ ] **Step 5: Chạy test để xác nhận nó pass**

Run: `npm test -- tests/services/play-round.test.ts`
Expected: PASS, 18 test.

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS, toàn bộ.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services tests/services
git commit -m "feat(services): chơi một ván nguyên tử, phân biệt retry với replay, bỏ lượt"
```

---

## Task 12: Rate limit

Tách sau một interface để test không cần Redis, và để mất Redis thì game vẫn chạy — chỉ mất lớp chắn bot.

**Files:**
- Create: `src/lib/rate-limit/index.ts`, `src/lib/rate-limit/memory.ts`, `src/lib/rate-limit/redis.ts`
- Test: `src/lib/rate-limit/memory.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `interface RateLimitDecision { allowed: boolean; remaining: number; resetAt: number }`
  - `interface RateLimiter { hit(key: string, limit: number, windowSeconds: number, now?: number): Promise<RateLimitDecision> }`
  - `function createMemoryRateLimiter(): RateLimiter`
  - `function createRedisRateLimiter(url: string): RateLimiter`
  - `function getRateLimiter(): RateLimiter`

- [ ] **Step 1: Viết test**

```ts
// src/lib/rate-limit/memory.test.ts
import { describe, expect, it } from 'vitest'
import { createMemoryRateLimiter } from './memory'

describe('rate limiter trong bộ nhớ', () => {
  it('cho qua tới đúng hạn mức rồi chặn', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    for (let i = 0; i < 3; i++) {
      const decision = await limiter.hit('player-1', 3, 60, now)
      expect(decision.allowed).toBe(true)
      expect(decision.remaining).toBe(2 - i)
    }

    const blocked = await limiter.hit('player-1', 3, 60, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('mở lại sau khi hết cửa sổ', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    await limiter.hit('player-2', 1, 60, now)
    expect((await limiter.hit('player-2', 1, 60, now)).allowed).toBe(false)
    expect((await limiter.hit('player-2', 1, 60, now + 61_000)).allowed).toBe(true)
  })

  it('cửa sổ vẫn còn hiệu lực ở đúng mốc resetAt', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    // Chốt ranh giới: test "mở lại sau khi hết cửa sổ" dùng now + 61s nên nó pass
    // với cả `>` lẫn `>=`, tức là không ghim được ngữ nghĩa nào. Mốc đúng bằng
    // resetAt mới phân biệt hai cách so sánh.
    await limiter.hit('bien', 1, 60, now)
    expect((await limiter.hit('bien', 1, 60, now + 59_999)).allowed).toBe(false)
    expect((await limiter.hit('bien', 1, 60, now + 60_000)).allowed).toBe(true)
  })

  it('đếm riêng cho từng khoá', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    await limiter.hit('a', 1, 60, now)
    expect((await limiter.hit('b', 1, 60, now)).allowed).toBe(true)
  })

  it('trả về mốc thời gian mở lại', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000
    const decision = await limiter.hit('c', 1, 30, now)
    expect(decision.resetAt).toBe(now + 30_000)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/rate-limit/memory.test.ts`
Expected: FAIL — không tìm thấy module `./memory`.

- [ ] **Step 3: Viết `index.ts` (chỉ kiểu và bộ chọn)**

```ts
// src/lib/rate-limit/index.ts
import { logger } from '@/lib/observability/logger'
import { createMemoryRateLimiter } from './memory'
import { createRedisRateLimiter } from './redis'

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number, now?: number): Promise<RateLimitDecision>
}

let shared: RateLimiter | undefined

/**
 * Không có REDIS_URL thì rơi về bộ nhớ — game vẫn chạy, chỉ mất lớp chắn bot.
 *
 * Dựng client cũng phải rơi về bộ nhớ chứ không được ném lên: một REDIS_URL gõ sai
 * là tình huống dễ gặp hơn nhiều so với Redis sập giữa chừng, và để nó nổ ở đây thì
 * cả game chết vì một biến môi trường sai — đúng thứ nguyên tắc fail-open sinh ra
 * để tránh.
 */
export function getRateLimiter(): RateLimiter {
  if (!shared) {
    const url = process.env.REDIS_URL
    if (!url) {
      shared = createMemoryRateLimiter()
    } else {
      try {
        shared = createRedisRateLimiter(url)
      } catch (error) {
        logger.error({ err: error }, 'không dựng được rate limiter Redis, rơi về bộ nhớ')
        shared = createMemoryRateLimiter()
      }
    }
  }
  return shared
}

export { createMemoryRateLimiter, createRedisRateLimiter }
```

- [ ] **Step 4: Viết `memory.ts`**

```ts
// src/lib/rate-limit/memory.ts
import type { RateLimitDecision, RateLimiter } from './index'

interface Window {
  count: number
  resetAt: number
}

/** Cửa sổ cố định. Dùng cho test và cho môi trường không có Redis. */
export function createMemoryRateLimiter(): RateLimiter {
  const windows = new Map<string, Window>()

  return {
    async hit(key, limit, windowSeconds, now = Date.now()): Promise<RateLimitDecision> {
      const existing = windows.get(key)
      const window =
        existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowSeconds * 1000 }

      window.count++
      windows.set(key, window)

      return {
        allowed: window.count <= limit,
        remaining: Math.max(0, limit - window.count),
        resetAt: window.resetAt,
      }
    },
  }
}
```

- [ ] **Step 5: Viết `redis.ts`**

```ts
// src/lib/rate-limit/redis.ts
import Redis from 'ioredis'
import { logger } from '@/lib/observability/logger'
import type { RateLimitDecision, RateLimiter } from './index'

/**
 * Cửa sổ cố định bằng INCR + EXPIRE. Đủ cho mục đích chặn bot, và quan trọng hơn:
 * Redis chết thì cho qua thay vì chặn hết người chơi.
 */
export function createRedisRateLimiter(url: string): RateLimiter {
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })

  return {
    async hit(key, limit, windowSeconds, now = Date.now()): Promise<RateLimitDecision> {
      const bucket = Math.floor(now / (windowSeconds * 1000))
      const redisKey = `rl:${key}:${bucket}`

      try {
        const count = await redis.incr(redisKey)
        if (count === 1) await redis.expire(redisKey, windowSeconds)

        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          resetAt: (bucket + 1) * windowSeconds * 1000,
        }
      } catch (error) {
        // Cho qua khi Redis hỏng là có chủ đích. Nhưng phải để lại dấu: nếu đây là
        // bug trong code chứ không phải sự cố hạ tầng, mọi lời gọi đều ném và lớp
        // chắn bot tắt vĩnh viễn mà không ai biết.
        logger.warn({ err: error, key }, 'rate limiter Redis lỗi, cho qua')
        return { allowed: true, remaining: limit, resetAt: now + windowSeconds * 1000 }
      }
    },
  }
}
```

- [ ] **Step 6: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/rate-limit/memory.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rate-limit
git commit -m "feat(rate-limit): cửa sổ cố định trên Redis, rơi về bộ nhớ khi thiếu Redis"
```

---

## Task 13: Route handler HTTP

**Files:**
- Create: `src/lib/http/handler.ts`, `src/lib/http/session.ts`, `src/lib/http/schemas.ts`
- Create: `src/app/api/runs/route.ts`, `src/app/api/runs/[id]/route.ts`, `src/app/api/runs/[id]/rounds/route.ts`, `src/app/api/runs/[id]/abandon/route.ts`
- Test: `tests/api/runs.test.ts`

**Interfaces:**
- Consumes: services, session cookie, rate limiter, logger
- Produces:
  - `function withRequest(handler: (req: Request, ctx: HandlerContext) => Promise<Response>): (req: Request, ctx: RouteParams) => Promise<Response>`
  - `interface HandlerContext { requestId: string; playerId: string; params: Record<string, string>; setCookie?: string }`
  - Bốn endpoint như mô tả trong spec

- [ ] **Step 1: Viết `src/lib/http/schemas.ts`**

```ts
// src/lib/http/schemas.ts
import { z } from 'zod'
import { NotFoundError } from '@/lib/services/errors'

export const startRunSchema = z.object({
  clientSeed: z.string().trim().max(128).optional(),
})

export const playRoundSchema = z.object({
  hand: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  nonce: z.number().int().min(0),
})

const runIdSchema = z.string().uuid()

/**
 * Kiểm id lượt trước khi chạm DB. Không có bước này thì `/api/runs/khong-phai-uuid`
 * làm Postgres ném "invalid input syntax for type uuid" và rơi vào nhánh 500.
 *
 * Trả 404 chứ không phải 400 là có chủ đích: người dò id không được phân biệt
 * "id sai định dạng" với "id đúng định dạng nhưng không phải của bạn".
 */
export function parseRunId(raw: string): string {
  const parsed = runIdSchema.safeParse(raw)
  if (!parsed.success) throw new NotFoundError('không tìm thấy lượt chơi')
  return parsed.data
}
```

- [ ] **Step 2: Viết `src/lib/http/session.ts`**

```ts
// src/lib/http/session.ts
import { getDb } from '@/lib/db/client'
import { createPlayer, findPlayer } from '@/lib/repo/players'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, readPlayerId, signPlayerId } from '@/lib/session/cookie'

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

export interface ResolvedSession {
  playerId: string
  setCookie?: string
}

/** Đọc người chơi từ cookie, tạo mới nếu chưa có hoặc cookie không hợp lệ. */
export async function resolveSession(request: Request): Promise<ResolvedSession> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('thiếu biến môi trường SESSION_SECRET')

  const db = getDb()
  const signed = readCookie(request, SESSION_COOKIE)
  const claimed = readPlayerId(signed, secret)

  if (claimed && (await findPlayer(db, claimed))) {
    return { playerId: claimed }
  }

  const player = await createPlayer(db)
  const value = signPlayerId(player.id, secret)
  const attributes = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')

  return { playerId: player.id, setCookie: attributes.join('; ') }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
```

- [ ] **Step 3: Viết `src/lib/http/handler.ts`**

```ts
// src/lib/http/handler.ts
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { getDb } from '@/lib/db/client'
import { getLogger } from '@/lib/observability/logger'
import { runWithContext, setContext } from '@/lib/observability/request-context'
import { ServiceError, recordRejection } from '@/lib/services/errors'
import { resolveSession } from './session'

export interface HandlerContext {
  requestId: string
  playerId: string
  params: Record<string, string>
}

type RouteParams = { params: Promise<Record<string, string>> }

function jsonResponse(body: unknown, status: number, setCookie?: string, requestId?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (setCookie) headers.append('set-cookie', setCookie)
  if (requestId) headers.set('x-request-id', requestId)
  return new Response(JSON.stringify(body), { status, headers })
}

/**
 * Bọc mọi route: gán requestId, dựng session, đặt request context cho logger,
 * và quy lỗi có kiểu về mã HTTP tương ứng.
 */
export function withRequest(
  handler: (request: Request, context: HandlerContext) => Promise<unknown>,
) {
  return async (request: Request, route?: RouteParams): Promise<Response> => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID()

    return runWithContext({ requestId }, async () => {
      const startedAt = Date.now()
      let setCookie: string | undefined

      try {
        const session = await resolveSession(request)
        setCookie = session.setCookie
        setContext({ playerId: session.playerId })

        const params = route ? await route.params : {}
        const body = await handler(request, { requestId, playerId: session.playerId, params })

        getLogger().info({ durationMs: Date.now() - startedAt, status: 200 }, 'request ok')
        return jsonResponse(body, 200, setCookie, requestId)
      } catch (error) {
        if (error instanceof ZodError) {
          getLogger().warn({ issues: error.issues }, 'dữ liệu gửi lên không hợp lệ')
          return jsonResponse({ error: 'invalid_request', issues: error.issues }, 400, setCookie, requestId)
        }
        if (error instanceof ServiceError) {
          // Bắt cả lỗi ném thẳng từ route (rate limit) — recordRejection tự bỏ qua
          // nếu service đã ghi audit rồi, nên không có chuyện ghi hai lần.
          await recordRejection(getDb(), error).catch((failure) =>
            getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
          )
          getLogger().warn({ code: error.code, status: error.httpStatus }, error.message)
          return jsonResponse({ error: error.code, message: error.message }, error.httpStatus, setCookie, requestId)
        }
        getLogger().error({ err: error }, 'lỗi không lường trước')
        return jsonResponse({ error: 'internal_error' }, 500, setCookie, requestId)
      }
    })
  }
}
```

- [ ] **Step 4: Viết bốn route**

```ts
// src/app/api/runs/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { startRunSchema } from '@/lib/http/schemas'
import { clientIp } from '@/lib/http/session'
import { getRateLimiter } from '@/lib/rate-limit'
import { hashIp } from '@/lib/session/cookie'
import { RateLimitedError } from '@/lib/services/errors'
import { startRun } from '@/lib/services/start-run'

export const POST = withRequest(async (request, context) => {
  const body = startRunSchema.parse(await request.json().catch(() => ({})))
  // Không đặt giá trị mặc định cho muối: thiếu biến này mà vẫn chạy nghĩa là mọi
  // triển khai băm IP bằng cùng một muối ai cũng đoán được, và bảng tra ngược dựng
  // sẵn sẽ khôi phục lại IP thô. Thà sập lúc khởi động còn hơn âm thầm mất tác dụng.
  const salt = process.env.IP_HASH_SALT
  if (!salt) throw new Error('thiếu biến môi trường IP_HASH_SALT')
  const ipHash = hashIp(clientIp(request), salt)

  const decision = await getRateLimiter().hit(`start:${context.playerId}`, 30, 60)
  if (!decision.allowed) {
    throw new RateLimitedError('tạo lượt quá nhanh', {
      type: 'rate_limited',
      playerId: context.playerId,
      requestId: context.requestId,
      payload: { scope: 'start' },
    })
  }

  return startRun({
    db: getDb(),
    playerId: context.playerId,
    clientSeed: body.clientSeed,
    ipHash,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestId: context.requestId,
  })
})
```

```ts
// src/app/api/runs/[id]/rounds/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId, playRoundSchema } from '@/lib/http/schemas'
import { getRateLimiter } from '@/lib/rate-limit'
import { RateLimitedError } from '@/lib/services/errors'
import { playRound } from '@/lib/services/play-round'
import { setContext } from '@/lib/observability/request-context'

export const POST = withRequest(async (request, context) => {
  const startedAt = Date.now()
  // .catch giống route tạo lượt: body rỗng hoặc hỏng làm request.json() ném
  // SyntaxError, vốn không phải ZodError lẫn ServiceError nên rơi thẳng vào 500.
  const body = playRoundSchema.parse(await request.json().catch(() => ({})))
  const runId = parseRunId(context.params.id)
  setContext({ runId, nonce: body.nonce })

  const decision = await getRateLimiter().hit(`round:${context.playerId}`, 120, 60)
  if (!decision.allowed) {
    throw new RateLimitedError('chơi quá nhanh', {
      type: 'rate_limited',
      playerId: context.playerId,
      runId,
      requestId: context.requestId,
      payload: { scope: 'round', nonce: body.nonce },
    })
  }

  return playRound({
    db: getDb(),
    runId,
    playerId: context.playerId,
    hand: body.hand,
    nonce: body.nonce,
    requestId: context.requestId,
    latencyMs: Date.now() - startedAt,
  })
})
```

```ts
// src/app/api/runs/[id]/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId } from '@/lib/http/schemas'
import { listRounds } from '@/lib/repo/rounds'
import { lockRun } from '@/lib/repo/runs'
import { NotFoundError } from '@/lib/services/errors'
import { runs } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const GET = withRequest(async (_request, context) => {
  const db = getDb()
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, parseRunId(context.params.id)), eq(runs.playerId, context.playerId)))
    .limit(1)

  if (!run) throw new NotFoundError('không tìm thấy lượt chơi')

  const played = await listRounds(db, run.id)

  return {
    runId: run.id,
    runCode: run.runCode,
    commitment: run.commitment,
    clientSeed: run.clientSeed,
    status: run.status,
    wins: run.wins,
    nextNonce: run.nextNonce,
    targetWins: run.targetWins,
    // Chỉ lộ khi lượt đã kết thúc.
    serverSeed: run.status === 'active' ? undefined : run.serverSeed,
    rounds: played.map((r) => ({
      nonce: r.nonce,
      playerHand: r.playerHand,
      serverHand: r.serverHand,
      outcome: r.outcome,
    })),
  }
})
```

```ts
// src/app/api/runs/[id]/abandon/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId } from '@/lib/http/schemas'
import { abandonRun } from '@/lib/services/abandon-run'

export const POST = withRequest(async (_request, context) =>
  abandonRun({
    db: getDb(),
    runId: parseRunId(context.params.id),
    playerId: context.playerId,
    requestId: context.requestId,
  }),
)
```

- [ ] **Step 5: Viết test API**

```ts
// tests/api/runs.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { getTestDb, getTestDbUrl, resetTestDb, stopTestDb } from '../helpers/test-db'

let postRuns: (req: Request) => Promise<Response>
let postRounds: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
let getRun: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
let postAbandon: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

beforeAll(async () => {
  // getDb() đọc DATABASE_URL lúc gọi lần đầu, nên phải đặt env TRƯỚC khi import route.
  process.env.DATABASE_URL = await getTestDbUrl()
  process.env.SESSION_SECRET = 'khoa-test-du-dai-de-ky-hmac'
  process.env.IP_HASH_SALT = 'muoi-test'

  postRuns = (await import('@/app/api/runs/route')).POST
  postRounds = (await import('@/app/api/runs/[id]/rounds/route')).POST
  getRun = (await import('@/app/api/runs/[id]/route')).GET
  postAbandon = (await import('@/app/api/runs/[id]/abandon/route')).POST
})

afterAll(stopTestDb)
beforeEach(async () => resetTestDb(await getTestDb()))

function jsonRequest(url: string, body?: unknown, cookie?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (cookie) headers.set('cookie', cookie)
  return new Request(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })
}

async function startSession() {
  const response = await postRuns(jsonRequest('http://test/api/runs', {}))
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { body: await response.json(), cookie }
}

describe('POST /api/runs', () => {
  it('cấp cookie session cho người mới và trả về commitment', async () => {
    const response = await postRuns(jsonRequest('http://test/api/runs', {}))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/janken_pid=/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)

    const body = await response.json()
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(body.targetWins).toBe(20)
  })

  it('KHÔNG BAO GIỜ trả serverSeed khi lượt còn active — hình dạng response bị khoá', async () => {
    const { body } = await startSession()
    expect(Object.keys(body).sort()).toEqual([
      'clientSeed',
      'commitment',
      'nextNonce',
      'resumed',
      'runCode',
      'runId',
      'targetWins',
      'wins',
    ])
  })

  it('từ chối clientSeed dài quá mức', async () => {
    const response = await postRuns(jsonRequest('http://test/api/runs', { clientSeed: 'x'.repeat(500) }))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/runs/:id/rounds', () => {
  it('chơi được một ván và không lộ seed khi lượt còn active', async () => {
    const db = await getTestDb()
    const { body: run, cookie } = await startSession()
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })
    const drawHand = deriveHand(row.serverSeed, row.clientSeed, 0) as Hand

    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: drawHand, nonce: 0 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.outcome).toBe('draw')
    expect(body.status).toBe('active')
    expect(body).not.toHaveProperty('serverSeed')
    expect(JSON.stringify(body)).not.toContain(row.serverSeed)
  })

  it('trả 409 khi sai thứ tự nonce', async () => {
    const { body: run, cookie } = await startSession()
    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 0, nonce: 4 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('nonce_mismatch')
  })

  it('trả 400 khi body không phải JSON hợp lệ', async () => {
    const { body: run, cookie } = await startSession()
    const headers = new Headers({ 'content-type': 'application/json', cookie })
    const response = await postRounds(
      new Request(`http://test/api/runs/${run.runId}/rounds`, { method: 'POST', headers, body: 'khong-phai-json' }),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(400)
  })

  it('trả 400 khi tay không hợp lệ', async () => {
    const { body: run, cookie } = await startSession()
    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 7, nonce: 0 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(400)
  })

  it('trả 404 khi lượt thuộc về người khác', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 0, nonce: 0 }, other.cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })
})

describe('GET /api/runs/:id', () => {
  it('khôi phục được trạng thái lượt mà không lộ seed', async () => {
    const { body: run, cookie } = await startSession()
    const response = await getRun(new Request(`http://test/api/runs/${run.runId}`, { headers: { cookie } }), {
      params: Promise.resolve({ id: run.runId }),
    })

    const body = await response.json()
    expect(body.status).toBe('active')
    expect(body.nextNonce).toBe(0)
    expect(body.serverSeed).toBeUndefined()
    expect(body.rounds).toEqual([])
  })

  it('không cho người chơi khác đọc lượt của mình', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await getRun(
      new Request(`http://test/api/runs/${run.runId}`, { headers: { cookie: other.cookie } }),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })

  it('id sai định dạng trả 404 chứ không phải 500', async () => {
    const { cookie } = await startSession()
    const response = await getRun(
      new Request('http://test/api/runs/khong-phai-uuid', { headers: { cookie } }),
      { params: Promise.resolve({ id: 'khong-phai-uuid' }) },
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/runs/:id/abandon', () => {
  it('đóng lượt và công bố seed', async () => {
    const db = await getTestDb()
    const { body: run, cookie } = await startSession()
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const response = await postAbandon(
      jsonRequest(`http://test/api/runs/${run.runId}/abandon`, undefined, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('abandoned')
    // Bỏ lượt là đường kết thúc, nên đây là chỗ DUY NHẤT seed được phép xuất hiện.
    expect(body.serverSeed).toBe(row.serverSeed)
  })

  it('không cho người chơi khác bỏ lượt của mình', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await postAbandon(
      jsonRequest(`http://test/api/runs/${run.runId}/abandon`, undefined, other.cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })
})
```

- [ ] **Step 6: Chạy test**

Run: `npm test -- tests/api/runs.test.ts`
Expected: PASS, 13 test.

- [ ] **Step 7: Chạy toàn bộ test và typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, không lỗi kiểu.

- [ ] **Step 8: Commit**

```bash
git add src/lib/http src/app/api tests/api
git commit -m "feat(api): bốn endpoint chơi game, khoá hình dạng response chống lộ seed"
```

---

## Task 14: Màn chơi

Mật mã học tạo ra tính công bằng, nhưng UI mới tạo ra *cảm giác* công bằng. Ba thứ bắt buộc phải có trên màn hình: mã cam kết hiển thị nổi bật **trước** khi người chơi click, ô cho người chơi tự nhập `clientSeed`, và đường dẫn sang trang kiểm chứng khi lượt kết thúc.

**Files:**
- Create: `src/lib/client/api.ts`, `src/components/game/GameBoard.tsx`, `src/components/game/CommitmentPanel.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/lib/client/api.test.ts`

**Interfaces:**
- Consumes: bốn endpoint từ Task 13
- Produces:
  - `interface RunView { runId: string; runCode: string; commitment: string; clientSeed: string; targetWins: number; wins: number; nextNonce: number }`
  - `interface RoundView { nonce: number; playerHand: Hand; serverHand: Hand; outcome: Outcome; wins: number; status: RunStatus; serverSeed?: string }`
  - `function apiStartRun(clientSeed?: string): Promise<RunView & { resumed: boolean }>`
  - `function apiPlayRound(runId: string, hand: Hand, nonce: number): Promise<RoundView>`
  - `function apiGetRun(runId: string): Promise<RunView & { status: RunStatus; serverSeed?: string; rounds: RecordedRound[] }>`
  - `function apiAbandonRun(runId: string): Promise<{ status: 'abandoned'; serverSeed: string; wins: number }>`

- [ ] **Step 1: Viết test cho lớp gọi API**

```ts
// src/lib/client/api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiPlayRound, apiStartRun } from './api'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('lớp gọi API', () => {
  it('trả về body khi thành công', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { runId: 'r1', commitment: 'abc' }))
    await expect(apiStartRun()).resolves.toMatchObject({ runId: 'r1' })
  })

  it('gửi clientSeed người chơi nhập', async () => {
    const fetchMock = mockFetch(200, { runId: 'r1' })
    vi.stubGlobal('fetch', fetchMock)

    await apiStartRun('hat-giong-cua-toi')

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ clientSeed: 'hat-giong-cua-toi' })
  })

  it('ném ApiError mang mã lỗi khi server từ chối', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'nonce_mismatch', message: 'sai thứ tự ván' }))

    await expect(apiPlayRound('r1', 0, 3)).rejects.toMatchObject({
      code: 'nonce_mismatch',
      status: 409,
    })
    expect(new ApiError('x', 400, 'y')).toBeInstanceOf(Error)
  })

  it('ném ApiError khi server trả body không phải JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sập', { status: 502 })))
    await expect(apiStartRun()).rejects.toMatchObject({ status: 502 })
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/client/api.test.ts`
Expected: FAIL — không tìm thấy module `./api`.

- [ ] **Step 3: Viết `src/lib/client/api.ts`**

```ts
// src/lib/client/api.ts
import type { RecordedRound } from '@/lib/fairness'
import type { Hand, Outcome } from '@/lib/game/hands'
import type { RunStatus } from '@/lib/game/run-state'

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RunView {
  runId: string
  runCode: string
  commitment: string
  clientSeed: string
  targetWins: number
  wins: number
  nextNonce: number
}

export interface RoundView {
  nonce: number
  playerHand: Hand
  serverHand: Hand
  outcome: Outcome
  wins: number
  status: RunStatus
  targetWins: number
  serverSeed?: string
  replayed: boolean
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const code = (body as { error?: string } | null)?.error ?? 'unknown_error'
    const message = (body as { message?: string } | null)?.message ?? `HTTP ${response.status}`
    throw new ApiError(code, response.status, message)
  }
  return body as T
}

export function apiStartRun(clientSeed?: string) {
  return call<RunView & { resumed: boolean }>('/api/runs', {
    method: 'POST',
    body: JSON.stringify(clientSeed ? { clientSeed } : {}),
  })
}

export function apiPlayRound(runId: string, hand: Hand, nonce: number) {
  return call<RoundView>(`/api/runs/${runId}/rounds`, {
    method: 'POST',
    body: JSON.stringify({ hand, nonce }),
  })
}

export function apiGetRun(runId: string) {
  return call<RunView & { status: RunStatus; serverSeed?: string; rounds: RecordedRound[] }>(
    `/api/runs/${runId}`,
  )
}

export function apiAbandonRun(runId: string) {
  return call<{ status: 'abandoned'; serverSeed: string; wins: number }>(`/api/runs/${runId}/abandon`, {
    method: 'POST',
  })
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/client/api.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết `CommitmentPanel.tsx`**

```tsx
// src/components/game/CommitmentPanel.tsx
'use client'

import type { RecordedRound } from '@/lib/fairness'

interface Props {
  commitment: string
  clientSeed: string
  runCode: string
  serverSeed?: string
  rounds?: RecordedRound[]
}

/** Trên ngưỡng này thì bỏ danh sách ván khỏi URL, tránh proxy cắt cụt query string. */
const MAX_ROUNDS_PARAM_LENGTH = 6000

export function CommitmentPanel({ commitment, clientSeed, runCode, serverSeed, rounds }: Props) {
  // Truyền cả danh sách ván sang trang kiểm chứng. Thiếu nó, trang kia chỉ đối
  // chiếu được cam kết — tức là chứng minh seed khớp hash đã công bố, nhưng
  // KHÔNG dựng lại được từng tay để so với bản ghi. Mà dựng lại từng tay mới là
  // điều sản phẩm này hứa với người chơi.
  const roundsParam = rounds?.length ? JSON.stringify(rounds) : ''
  const encodedRounds = roundsParam ? encodeURIComponent(roundsParam) : ''
  const roundsFitInUrl = encodedRounds.length > 0 && encodedRounds.length <= MAX_ROUNDS_PARAM_LENGTH
  const roundsOmitted = encodedRounds.length > MAX_ROUNDS_PARAM_LENGTH
  const verifyHref =
    `/verify?serverSeed=${serverSeed}&clientSeed=${encodeURIComponent(clientSeed)}` +
    `&commitment=${commitment}` +
    (roundsFitInUrl ? `&rounds=${encodedRounds}` : '')

  return (
    <section className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Cam kết trước khi bạn bấm</h2>
      <p className="mb-3 text-slate-600">
        Tay của máy cho cả lượt này đã được chốt từ trước và niêm phong bằng mã dưới đây. Máy không
        thể đổi tay sau khi nhìn thấy tay bạn — hết lượt bạn tự kiểm tra lại được.
      </p>

      <dl className="space-y-2 font-mono text-xs">
        <div>
          <dt className="text-slate-500">Mã lượt</dt>
          <dd className="break-all">{runCode}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Mã niêm phong (SHA-256 của hạt giống máy)</dt>
          <dd className="break-all">{commitment}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Hạt giống của bạn</dt>
          <dd className="break-all">{clientSeed}</dd>
        </div>
        {serverSeed && (
          <div>
            <dt className="text-slate-500">Hạt giống của máy (đã công bố)</dt>
            <dd className="break-all">{serverSeed}</dd>
          </div>
        )}
      </dl>

      {serverSeed && (
        <div className="mt-3 space-y-2">
          <a className="inline-block underline" href={verifyHref}>
            Tự kiểm chứng lượt này
          </a>

          {/*
            Vượt ngưỡng thì link chỉ đối chiếu được cam kết, không dựng lại từng
            ván. Im lặng ở đây là tệ nhất: người chơi thấy chữ KHỚP và tưởng đã
            kiểm xong, trong khi phần đáng xem nhất còn chưa chạy. Nói thẳng ra,
            và đưa luôn dữ liệu để họ tự dán.
          */}
          {roundsOmitted && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">
                Lượt này quá dài để nhét vào đường dẫn — bấm để lấy danh sách ván
              </summary>
              <p className="mt-2">
                Link trên chỉ đối chiếu được mã niêm phong. Sao chép khối dưới đây và dán vào ô
                &ldquo;Danh sách ván&rdquo; ở trang kiểm chứng để dựng lại từng tay.
              </p>
              <textarea
                className="mt-2 h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs"
                readOnly
                value={roundsParam}
              />
            </details>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Viết `GameBoard.tsx`**

```tsx
// src/components/game/GameBoard.tsx
'use client'

import { useState } from 'react'
import { CommitmentPanel } from './CommitmentPanel'
import {
  ApiError,
  apiAbandonRun,
  apiGetRun,
  apiPlayRound,
  apiStartRun,
  type RoundView,
  type RunView,
} from '@/lib/client/api'
import type { RecordedRound } from '@/lib/fairness'
import { HAND_NAMES, type Hand } from '@/lib/game/hands'
import type { RunStatus } from '@/lib/game/run-state'

const HANDS: Hand[] = [0, 1, 2]

export function GameBoard() {
  const [seedInput, setSeedInput] = useState('')
  const [run, setRun] = useState<RunView | null>(null)
  const [status, setStatus] = useState<RunStatus>('active')
  const [wins, setWins] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [lastRound, setLastRound] = useState<RoundView | null>(null)
  const [serverSeed, setServerSeed] = useState<string | undefined>()
  const [rounds, setRounds] = useState<RecordedRound[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const started = await apiStartRun(seedInput.trim() || undefined)
      setRun(started)
      setWins(started.wins)
      setNonce(started.nextNonce)
      setStatus('active')
      setLastRound(null)
      setServerSeed(undefined)
      setRounds([])
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'không kết nối được máy chủ')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Kéo lại trạng thái thật từ server.
   *
   * Cần khi response của một ván bị mất trên đường về: server đã ghi ván, nonce
   * cục bộ thì chưa tăng, nên mọi lần bấm sau đều 409 nonce_mismatch. Người chơi
   * chỉ thoát được bằng cách bấm lại đúng tay cũ — mà họ không có cách nào biết
   * điều đó — hoặc bỏ lượt và mất cả chuỗi.
   */
  async function resync(runId: string) {
    try {
      const fresh = await apiGetRun(runId)
      setWins(fresh.wins)
      setNonce(fresh.nextNonce)
      setStatus(fresh.status)
      if (fresh.serverSeed) setServerSeed(fresh.serverSeed)
    } catch {
      // Đồng bộ lại cũng hỏng thì giữ nguyên lỗi đang hiện, đừng đè lên.
    }
  }

  async function play(hand: Hand) {
    if (!run || busy || status !== 'active') return
    setBusy(true)
    setError(null)
    try {
      const result = await apiPlayRound(run.runId, hand, nonce)
      setLastRound(result)
      setWins(result.wins)
      setNonce(result.nonce + 1)
      setStatus(result.status)
      if (result.serverSeed) setServerSeed(result.serverSeed)

      // Lượt vừa kết thúc: lấy toàn bộ bản ghi ván để nhét vào link kiểm chứng.
      // Không có nó thì trang kia chỉ đối chiếu được cam kết, không dựng lại được
      // từng tay — mà đó mới là điều đáng xem.
      if (result.status !== 'active') {
        const finished = await apiGetRun(run.runId).catch(() => null)
        if (finished) setRounds(finished.rounds)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'không kết nối được máy chủ')
      await resync(run.runId)
    } finally {
      setBusy(false)
    }
  }

  async function abandon() {
    if (!run || busy || status !== 'active') return
    setBusy(true)
    setError(null)
    try {
      const result = await apiAbandonRun(run.runId)
      setStatus('abandoned')
      setServerSeed(result.serverSeed)
      const finished = await apiGetRun(run.runId).catch(() => null)
      if (finished) setRounds(finished.rounds)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'không kết nối được máy chủ')
    } finally {
      setBusy(false)
    }
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block">Hạt giống của bạn (tuỳ chọn — để trống thì máy sinh ngẫu nhiên)</span>
          <input
            className="w-full rounded border border-slate-300 p-2 font-mono"
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            maxLength={128}
            placeholder="gõ gì cũng được"
          />
        </label>
        <p className="text-sm text-slate-600">
          Hạt giống này bị khoá ngay khi lượt bắt đầu và tham gia vào việc quyết định tay của máy.
          Bạn tự chọn nó, nên máy không thể tính trước theo ý mình.
        </p>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          onClick={start}
          disabled={busy}
        >
          Bắt đầu lượt mới
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CommitmentPanel
        commitment={run.commitment}
        clientSeed={run.clientSeed}
        runCode={run.runCode}
        serverSeed={serverSeed}
        rounds={rounds}
      />

      <p className="text-lg">
        Chuỗi thắng: <strong>{wins}</strong> / {run.targetWins} · đã đánh {nonce} ván
      </p>

      {status === 'active' ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            {HANDS.map((hand) => (
              <button
                key={hand}
                className="rounded border border-slate-400 px-6 py-4 text-lg capitalize disabled:opacity-50"
                onClick={() => play(hand)}
                disabled={busy}
              >
                {HAND_NAMES[hand]}
              </button>
            ))}
          </div>
          {/* Bỏ lượt công bố seed ngay, nên người chơi vẫn kiểm chứng được phần đã đánh. */}
          <button className="text-sm text-slate-500 underline" onClick={abandon} disabled={busy}>
            Bỏ lượt và xem hạt giống
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-lg font-semibold">
            {status === 'won' && `Bạn thắng trọn ${run.targetWins} ván liên tiếp.`}
            {status === 'lost' && `Đứt chuỗi ở ván thứ ${wins + 1}.`}
            {status === 'abandoned' && 'Lượt đã đóng.'}
          </p>
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={start} disabled={busy}>
            Chơi lượt mới
          </button>
        </div>
      )}

      {lastRound && (
        <p className="text-sm">
          Ván {lastRound.nonce + 1}: bạn ra <strong>{HAND_NAMES[lastRound.playerHand]}</strong>, máy ra{' '}
          <strong>{HAND_NAMES[lastRound.serverHand]}</strong> →{' '}
          {lastRound.outcome === 'win' ? 'thắng' : lastRound.outcome === 'draw' ? 'hòa, đánh lại' : 'thua'}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Viết `src/app/page.tsx`**

```tsx
// src/app/page.tsx
import { GameBoard } from '@/components/game/GameBoard'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Kéo Búa Bao</h1>
        <p className="text-slate-600">Thắng liên tiếp để đi tới cuối. Mỗi ván đều kiểm chứng được.</p>
      </header>
      <GameBoard />
      <footer className="border-t pt-4 text-sm text-slate-500">
        <a className="underline" href="/verify">Kiểm chứng một lượt</a>
        {' · '}
        <a className="underline" href="/stats">Thống kê công khai</a>
      </footer>
    </main>
  )
}
```

- [ ] **Step 8: Chạy dev server và thử tay**

```bash
docker compose up -d
npm run dev
```

Mở `http://localhost:3000`, chơi vài ván. Kiểm bằng mắt: mã niêm phong hiện ra **trước** khi bấm; hạt giống máy chỉ xuất hiện sau khi lượt kết thúc.

- [ ] **Step 9: Chạy toàn bộ test và typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, không lỗi kiểu.

- [ ] **Step 10: Commit**

```bash
git add src/lib/client src/components src/app/page.tsx
git commit -m "feat(ui): màn chơi hiển thị cam kết trước khi bấm và công bố seed khi hết lượt"
```

---

## Task 15: Trang kiểm chứng

Trang này **không được gọi API nào**. Nó import thẳng `lib/fairness` và tính trong trình duyệt. Nếu nó phải hỏi server thì nó chẳng chứng minh được gì.

**Files:**
- Create: `src/app/verify/page.tsx`, `src/components/verify/VerifyForm.tsx`, `src/lib/verify/parse-rounds.ts`
- Test: `src/lib/verify/parse-rounds.test.ts`

**Interfaces:**
- Consumes: `verifyRun`, `RecordedRound` từ `@/lib/fairness`
- Produces:
  - `function parseRoundsInput(raw: string): RecordedRound[]` — đọc danh sách ván người dùng dán vào
  - Trang `/verify` nhận sẵn tham số truy vấn `serverSeed`, `clientSeed`, `commitment`

- [ ] **Step 1: Viết test cho bộ đọc dữ liệu dán vào**

```ts
// src/lib/verify/parse-rounds.test.ts
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
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/verify/parse-rounds.test.ts`
Expected: FAIL — không tìm thấy module `./parse-rounds`.

- [ ] **Step 3: Viết `parse-rounds.ts`**

```ts
// src/lib/verify/parse-rounds.ts
import type { RecordedRound } from '@/lib/fairness'
import { isHand } from '@/lib/game/hands'

const OUTCOMES = new Set(['win', 'lose', 'draw'])

export function parseRoundsInput(raw: string): RecordedRound[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('không đọc được dữ liệu — cần một mảng JSON các ván')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('không đọc được dữ liệu — cần một mảng JSON các ván')
  }

  return parsed.map((item, index) => {
    // Chặn null và giá trị nguyên thuỷ TRƯỚC khi ép kiểu: `[null]` mà đọc thẳng
    // `item.nonce` sẽ ném TypeError thô của engine, và người dùng nhận một thông
    // báo tiếng Anh khó hiểu thay vì lời giải thích họ hành động được.
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`ván thứ ${index + 1} không phải một đối tượng hợp lệ`)
    }

    const round = item as Partial<RecordedRound>
    if (round.nonce === undefined || round.playerHand === undefined || round.serverHand === undefined) {
      throw new Error(`ván thứ ${index + 1} thiếu trường bắt buộc`)
    }
    if (typeof round.nonce !== 'number' || !Number.isInteger(round.nonce) || round.nonce < 0) {
      throw new Error(`ván thứ ${index + 1} có nonce không hợp lệ, phải là số nguyên không âm`)
    }
    if (!isHand(round.playerHand) || !isHand(round.serverHand)) {
      throw new Error(`ván thứ ${index + 1} có tay không hợp lệ, phải là 0, 1 hoặc 2`)
    }
    if (typeof round.outcome !== 'string' || !OUTCOMES.has(round.outcome)) {
      throw new Error(`ván thứ ${index + 1} thiếu kết quả hợp lệ`)
    }
    return {
      nonce: round.nonce,
      playerHand: round.playerHand,
      serverHand: round.serverHand,
      outcome: round.outcome,
    }
  })
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- src/lib/verify/parse-rounds.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết `VerifyForm.tsx`**

```tsx
// src/components/verify/VerifyForm.tsx
'use client'

import { useState } from 'react'
import { commit, verifyRun, type VerifyResult } from '@/lib/fairness'
import { parseRoundsInput } from '@/lib/verify/parse-rounds'
import { HAND_NAMES } from '@/lib/game/hands'

interface Props {
  initialServerSeed?: string
  initialClientSeed?: string
  initialCommitment?: string
  initialRounds?: string
}

export function VerifyForm({
  initialServerSeed,
  initialClientSeed,
  initialCommitment,
  initialRounds,
}: Props) {
  const [serverSeed, setServerSeed] = useState(initialServerSeed ?? '')
  const [clientSeed, setClientSeed] = useState(initialClientSeed ?? '')
  const [commitment, setCommitment] = useState(initialCommitment ?? '')
  const [roundsRaw, setRoundsRaw] = useState(initialRounds ?? '')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    try {
      setResult(verifyRun({ serverSeed, clientSeed, commitment, rounds: parseRoundsInput(roundsRaw) }))
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : 'không kiểm chứng được')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Trang này tính toàn bộ trên máy bạn, không gửi gì lên máy chủ. Mở tab Network của trình duyệt
        mà xem — bấm Kiểm chứng không tạo ra một request nào.
      </p>

      {[
        { label: 'Hạt giống của máy', value: serverSeed, set: setServerSeed },
        { label: 'Hạt giống của bạn', value: clientSeed, set: setClientSeed },
        { label: 'Mã niêm phong đã công bố lúc đầu', value: commitment, set: setCommitment },
      ].map((field) => (
        <label key={field.label} className="block text-sm">
          <span className="mb-1 block">{field.label}</span>
          <input
            className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
            value={field.value}
            onChange={(event) => field.set(event.target.value)}
          />
        </label>
      ))}

      <label className="block text-sm">
        <span className="mb-1 block">Danh sách ván (JSON, tuỳ chọn)</span>
        <textarea
          className="h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          value={roundsRaw}
          onChange={(event) => setRoundsRaw(event.target.value)}
          placeholder='[{"nonce":0,"playerHand":1,"serverHand":0,"outcome":"win"}]'
        />
      </label>

      <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={run}>
        Kiểm chứng
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-3 rounded border border-slate-300 p-4">
          <p>
            Mã niêm phong:{' '}
            <strong className={result.commitmentValid ? 'text-green-700' : 'text-red-700'}>
              {result.commitmentValid ? 'KHỚP' : 'KHÔNG KHỚP'}
            </strong>
          </p>
          <p className="font-mono text-xs break-all">SHA-256(hạt giống máy) = {commit(serverSeed)}</p>

          {result.rounds.length > 0 && (
            <>
              <p>
                Các ván:{' '}
                <strong className={result.allRoundsMatch ? 'text-green-700' : 'text-red-700'}>
                  {result.allRoundsMatch ? 'TẤT CẢ KHỚP' : 'CÓ VÁN KHÔNG KHỚP'}
                </strong>
              </p>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Ván</th>
                    <th>Bạn</th>
                    <th>Máy (đã ghi)</th>
                    <th>Máy (tính lại)</th>
                    <th>Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rounds.map((round) => (
                    <tr key={round.nonce} className={round.matches ? '' : 'bg-red-100'}>
                      <td>{round.nonce}</td>
                      <td>{HAND_NAMES[round.playerHand]}</td>
                      <td>{HAND_NAMES[round.serverHand]}</td>
                      <td>{HAND_NAMES[round.recomputedServerHand]}</td>
                      <td>{round.matches ? 'khớp' : 'LỆCH'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Viết `src/app/verify/page.tsx`**

```tsx
// src/app/verify/page.tsx
import { VerifyForm } from '@/components/verify/VerifyForm'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const single = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key])

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Kiểm chứng lượt chơi</h1>
        <p className="text-slate-600">
          Dán hạt giống vào để tự dựng lại từng tay của máy và đối chiếu với mã niêm phong đã công bố
          trước khi bạn bấm ván đầu tiên.
        </p>
      </header>

      <VerifyForm
        initialServerSeed={single('serverSeed')}
        initialClientSeed={single('clientSeed')}
        initialCommitment={single('commitment')}
        initialRounds={single('rounds')}
      />
    </main>
  )
}
```

- [ ] **Step 7: Kiểm bằng tay rằng trang không gọi mạng**

Chạy `npm run dev`, chơi cho thua một lượt, bấm "Tự kiểm chứng lượt này", mở tab Network rồi bấm Kiểm chứng.
Expected: không có request nào phát sinh; mã niêm phong hiện KHỚP.

- [ ] **Step 8: Commit**

```bash
git add src/app/verify src/components/verify src/lib/verify
git commit -m "feat(verify): trang kiểm chứng chạy hoàn toàn trên trình duyệt"
```

---

## Task 16: Trang thống kê công khai

Tỉ lệ thắng quan sát được trên ván có phân định phải hội tụ về 50%. Đây vừa là tín hiệu vận hành — lệch nghĩa là có bug ở khâu suy ra tay server — vừa là công cụ tạo niềm tin mạnh hơn mọi giải thích về HMAC.

**Files:**
- Create: `src/lib/repo/stats.ts`, `src/app/stats/page.tsx`
- Test: `tests/repo/stats.test.ts`

**Interfaces:**
- Consumes: `Tx` từ repo/players, bảng `rounds`/`runs`
- Produces:
  - `interface GameStats { totalRounds: number; decidedRounds: number; playerWins: number; winRate: number | null; totalRuns: number; longestStreak: number }`
  - `function loadGameStats(tx: Tx): Promise<GameStats>`

- [ ] **Step 1: Viết test**

```ts
// tests/repo/stats.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { insertRun } from '@/lib/repo/runs'
import { loadGameStats } from '@/lib/repo/stats'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const seedValues = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('loadGameStats', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('trả về số 0 và winRate null khi chưa có ván nào', async () => {
    const stats = await loadGameStats(await getTestDb())
    expect(stats).toMatchObject({ totalRounds: 0, decidedRounds: 0, playerWins: 0, winRate: null })
  })

  it('loại ván hòa ra khỏi mẫu số của tỉ lệ thắng', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-STAT-001' })

    const outcomes = ['win', 'win', 'lose', 'lose', 'draw', 'draw', 'draw'] as const
    for (const [nonce, outcome] of outcomes.entries()) {
      await insertRound(db, { runId: run.id, nonce, playerHand: 0, serverHand: 1, outcome })
    }

    const stats = await loadGameStats(db)
    expect(stats.totalRounds).toBe(7)
    expect(stats.decidedRounds).toBe(4)
    expect(stats.playerWins).toBe(2)
    expect(stats.winRate).toBeCloseTo(0.5, 5)
  })

  it('đếm số lượt và chuỗi dài nhất', async () => {
    const db = await getTestDb()
    const a = await createPlayer(db)
    const b = await createPlayer(db)
    await insertRun(db, { ...seedValues, playerId: a.id, runCode: 'JKN-STAT-002', status: 'lost', wins: 4 })
    await insertRun(db, { ...seedValues, playerId: b.id, runCode: 'JKN-STAT-003', status: 'lost', wins: 9 })

    const stats = await loadGameStats(db)
    expect(stats.totalRuns).toBe(2)
    expect(stats.longestStreak).toBe(9)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- tests/repo/stats.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/repo/stats`.

- [ ] **Step 3: Viết `stats.ts`**

```ts
// src/lib/repo/stats.ts
import { sql } from 'drizzle-orm'
import type { Tx } from './players'

export interface GameStats {
  totalRounds: number
  decidedRounds: number
  playerWins: number
  /** null khi chưa có ván nào có phân định. */
  winRate: number | null
  totalRuns: number
  longestStreak: number
}

export async function loadGameStats(tx: Tx): Promise<GameStats> {
  const roundRows = await tx.execute<{ total: string; decided: string; wins: string }>(sql`
    SELECT
      count(*)                                        AS total,
      count(*) FILTER (WHERE outcome <> 'draw')       AS decided,
      count(*) FILTER (WHERE outcome = 'win')         AS wins
    FROM rounds
  `)

  const runRows = await tx.execute<{ total: string; longest: string | null }>(sql`
    SELECT count(*) AS total, max(wins) AS longest FROM runs
  `)

  const rounds = roundRows[0] ?? { total: '0', decided: '0', wins: '0' }
  const runs = runRows[0] ?? { total: '0', longest: null }

  const decidedRounds = Number(rounds.decided)
  const playerWins = Number(rounds.wins)

  return {
    totalRounds: Number(rounds.total),
    decidedRounds,
    playerWins,
    winRate: decidedRounds === 0 ? null : playerWins / decidedRounds,
    totalRuns: Number(runs.total),
    longestStreak: Number(runs.longest ?? 0),
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npm test -- tests/repo/stats.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Viết `src/app/stats/page.tsx`**

```tsx
// src/app/stats/page.tsx
import { getDb } from '@/lib/db/client'
import { loadGameStats } from '@/lib/repo/stats'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const stats = await loadGameStats(getDb())
  const formatter = new Intl.NumberFormat('vi-VN')

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Thống kê công khai</h1>
        <p className="text-slate-600">
          Trên các ván có phân định, tỉ lệ thắng phải hội tụ về 50%. Con số này là bằng chứng thống kê
          rằng luật chơi không nghiêng về phía nào.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-slate-500">Tổng số ván</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.totalRounds)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Ván có phân định</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.decidedRounds)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Tỉ lệ người chơi thắng</dt>
          <dd className="text-2xl font-semibold">
            {stats.winRate === null ? '—' : `${(stats.winRate * 100).toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Chuỗi dài nhất từng đạt</dt>
          <dd className="text-2xl font-semibold">{formatter.format(stats.longestStreak)}</dd>
        </div>
      </dl>

      <p className="text-sm text-slate-500">
        Đã chơi {formatter.format(stats.totalRuns)} lượt.
      </p>
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/repo/stats.ts src/app/stats tests/repo/stats.test.ts
git commit -m "feat(stats): trang thống kê công khai với tỉ lệ thắng tổng hợp"
```

---

## Task 17: Trang quản trị tra cứu lượt

Nhận khiếu nại → dán mã → có câu trả lời trong mười giây, kèm bằng chứng người chơi tự kiểm tra lại được.

**Files:**
- Create: `src/lib/services/inspect-run.ts`, `src/app/admin/runs/[code]/page.tsx`
- Test: `tests/services/inspect-run.test.ts`

**Interfaces:**
- Consumes: `findRunByCode`, `listRounds`, `listAuditForRun`, `verifyRun`
- Produces:
  - `interface RunInspection { run: {...}; verification: VerifyResult; audit: AuditEvent[] }`
  - `function inspectRun(db: Db, runCode: string): Promise<RunInspection>`
  - `function assertAdmin(token: string | undefined): void`

- [ ] **Step 1: Viết test**

```ts
// tests/services/inspect-run.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { ServiceError } from '@/lib/services/errors'
import { assertAdmin, inspectRun } from '@/lib/services/inspect-run'
import { playRound } from '@/lib/services/play-round'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const config = { targetWins: 20, maxRoundsPerRun: 300, attemptsPerDay: 0 }

describe('inspectRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('dựng lại một lượt trung thực và báo tất cả khớp', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const losingHand = ((deriveHand(row.serverSeed, row.clientSeed, 0) + 2) % 3) as Hand
    await playRound({ db, runId: run.runId, playerId: player.id, hand: losingHand, nonce: 0 })

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.run.status).toBe('lost')
    expect(inspection.verification.commitmentValid).toBe(true)
    expect(inspection.verification.allRoundsMatch).toBe(true)
    expect(inspection.audit.map((e) => e.type)).toContain('run_started')
  })

  it('phát hiện bản ghi ván bị sửa tay', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    // Ghi thẳng một ván sai lệch để mô phỏng dữ liệu hỏng hoặc bị can thiệp.
    const trueHand = deriveHand(row.serverSeed, row.clientSeed, 0)
    await insertRound(db, {
      runId: run.runId,
      nonce: 0,
      playerHand: 0,
      serverHand: ((trueHand + 1) % 3) as Hand,
      outcome: 'win',
    })

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.verification.allRoundsMatch).toBe(false)
    expect(inspection.verification.rounds[0].matches).toBe(false)
  })

  it('báo không tìm thấy khi mã sai', async () => {
    const db = await getTestDb()
    await expect(inspectRun(db, 'JKN-XXXX-XXXX')).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('assertAdmin', () => {
  // Phải khẳng định ĐÚNG loại lỗi, không chỉ "có ném". `timingSafeEqual` ném
  // RangeError khi hai buffer khác độ dài, nên nếu ai đó đảo thứ tự phép so sánh
  // độ dài với lời gọi đó, hàm sẽ nổ 500 thay vì từ chối sạch 403 — mà một
  // `.toThrow()` trần vẫn xanh y nguyên. Đây là chốt chặn duy nhất giữa người lạ
  // và seed của mọi lượt, kể cả lượt đang chơi dở.
  const expectDenied = (token: string | undefined) => {
    let thrown: unknown
    try {
      assertAdmin(token)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ServiceError)
    expect(thrown).toMatchObject({ code: 'forbidden', httpStatus: 403 })
  }

  it('từ chối khi token sai hoặc thiếu', () => {
    process.env.ADMIN_TOKEN = 'token-that'
    expectDenied(undefined)
    expectDenied('')
    expectDenied('token-gia')
    // Sai nhưng ĐÚNG độ dài: đường duy nhất thật sự chạy tới timingSafeEqual.
    expectDenied('token-thaX')
    expect(() => assertAdmin('token-that')).not.toThrow()
  })

  it('từ chối tất cả khi chưa cấu hình ADMIN_TOKEN', () => {
    delete process.env.ADMIN_TOKEN
    expectDenied('bat-ky')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- tests/services/inspect-run.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/services/inspect-run`.

- [ ] **Step 3: Viết `inspect-run.ts`**

```ts
// src/lib/services/inspect-run.ts
import { timingSafeEqual } from 'node:crypto'
import type { Db } from '@/lib/db/client'
import { verifyRun, type VerifyResult } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { listAuditForRun, type AuditEvent } from '@/lib/repo/audit'
import { listRounds } from '@/lib/repo/rounds'
import { lockRun } from '@/lib/repo/runs'
import { findRunByCode } from '@/lib/repo/runs'
import { NotFoundError, ServiceError } from './errors'

export interface RunInspection {
  run: {
    id: string
    runCode: string
    status: string
    wins: number
    targetWins: number
    commitment: string
    clientSeed: string
    serverSeed: string
    createdAt: Date
    endedAt: Date | null
  }
  verification: VerifyResult
  audit: AuditEvent[]
}

export function assertAdmin(token: string | undefined): void {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) throw new ServiceError('forbidden', 403, 'chưa cấu hình ADMIN_TOKEN')

  const a = Buffer.from(token ?? '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ServiceError('forbidden', 403, 'token quản trị không hợp lệ')
  }
}

/**
 * Dựng lại toàn cảnh một lượt bằng chính hàm mà người chơi dùng để kiểm chứng.
 * Một hàm, hai chỗ dùng — đó là điều khiến kết luận ở đây có sức nặng.
 */
export async function inspectRun(db: Db, runCode: string): Promise<RunInspection> {
  const run = await findRunByCode(db, runCode)
  if (!run) throw new NotFoundError(`không tìm thấy lượt có mã ${runCode}`)

  const played = await listRounds(db, run.id)

  return {
    run: {
      id: run.id,
      runCode: run.runCode,
      status: run.status,
      wins: run.wins,
      targetWins: run.targetWins,
      commitment: run.commitment,
      clientSeed: run.clientSeed,
      serverSeed: run.serverSeed,
      createdAt: run.createdAt,
      endedAt: run.endedAt,
    },
    verification: verifyRun({
      serverSeed: run.serverSeed,
      clientSeed: run.clientSeed,
      commitment: run.commitment,
      rounds: played.map((r) => ({
        nonce: r.nonce,
        playerHand: r.playerHand as Hand,
        serverHand: r.serverHand as Hand,
        outcome: r.outcome,
      })),
    }),
    audit: await listAuditForRun(db, run.id),
  }
}
```

- [ ] **Step 4: Viết trang quản trị**

```tsx
// src/app/admin/runs/[code]/page.tsx
import { headers } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { HAND_NAMES, type Hand } from '@/lib/game/hands'
import { assertAdmin, inspectRun } from '@/lib/services/inspect-run'

export const dynamic = 'force-dynamic'

export default async function AdminRunPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  assertAdmin((await headers()).get('x-admin-token') ?? undefined)

  const inspection = await inspectRun(getDb(), decodeURIComponent(code))
  const { run, verification, audit } = inspection

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Lượt {run.runCode}</h1>

      <p
        className={
          verification.commitmentValid && verification.allRoundsMatch
            ? 'rounded bg-green-100 p-3 text-green-900'
            : 'rounded bg-red-100 p-3 text-red-900'
        }
      >
        {verification.commitmentValid && verification.allRoundsMatch
          ? 'Toàn bộ lượt dựng lại khớp với bản ghi. Không có dấu hiệu bất thường.'
          : 'CẢNH BÁO: dựng lại không khớp bản ghi. Điều tra ngay.'}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-slate-500">Trạng thái</dt><dd>{run.status}</dd></div>
        <div><dt className="text-slate-500">Chuỗi thắng</dt><dd>{run.wins} / {run.targetWins}</dd></div>
        <div className="col-span-2"><dt className="text-slate-500">Mã niêm phong</dt><dd className="break-all font-mono text-xs">{run.commitment}</dd></div>
        <div className="col-span-2"><dt className="text-slate-500">Hạt giống máy</dt><dd className="break-all font-mono text-xs">{run.serverSeed}</dd></div>
        <div className="col-span-2"><dt className="text-slate-500">Hạt giống người chơi</dt><dd className="break-all font-mono text-xs">{run.clientSeed}</dd></div>
      </dl>

      <table className="w-full text-left text-sm">
        <thead>
          <tr><th>Ván</th><th>Người chơi</th><th>Máy (đã ghi)</th><th>Máy (tính lại)</th><th>Kết quả</th><th>Đối chiếu</th></tr>
        </thead>
        <tbody>
          {verification.rounds.map((round) => (
            <tr key={round.nonce} className={round.matches ? '' : 'bg-red-100'}>
              <td>{round.nonce}</td>
              <td>{HAND_NAMES[round.playerHand as Hand]}</td>
              <td>{HAND_NAMES[round.serverHand as Hand]}</td>
              <td>{HAND_NAMES[round.recomputedServerHand as Hand]}</td>
              <td>{round.outcome}</td>
              <td>{round.matches ? 'khớp' : 'LỆCH'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h2 className="mb-2 font-semibold">Sự kiện đối chiếu</h2>
        <ul className="space-y-1 text-xs">
          {audit.map((event) => (
            <li key={event.id} className="font-mono">
              {event.createdAt.toISOString()} · {event.type} · {JSON.stringify(event.payload)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
```

Trang này đọc token từ header `x-admin-token`, nên phải đặt sau một reverse proxy hoặc gọi bằng công cụ có gắn header. Với MVP như vậy là đủ; đừng dựng đăng nhập quản trị riêng.

- [ ] **Step 5: Chạy test**

Run: `npm test -- tests/services/inspect-run.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/inspect-run.ts src/app/admin tests/services/inspect-run.test.ts
git commit -m "feat(admin): tra cứu và dựng lại một lượt để xử lý khiếu nại"
```

---

## Task 18: Job tự đối chiếu hằng đêm

Phát hiện bug trước khi người chơi phát hiện.

**Files:**
- Create: `scripts/audit-runs.ts`, `src/lib/services/audit-sweep.ts`
- Test: `tests/services/audit-sweep.test.ts`

**Interfaces:**
- Consumes: `verifyRun`, `listRounds`, bảng `runs`
- Produces:
  - `interface SweepReport { scanned: number; mismatched: string[] }`
  - `function sweepFinishedRuns(db: Db, since: Date, limit?: number): Promise<SweepReport>`

- [ ] **Step 1: Viết test**

```ts
// tests/services/audit-sweep.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { insertRun, updateRunState } from '@/lib/repo/runs'
import { runs } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sweepFinishedRuns } from '@/lib/services/audit-sweep'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'
import { commit } from '@/lib/fairness'

const past = new Date('2020-01-01T00:00:00Z')

async function makeFinishedRun(db: Awaited<ReturnType<typeof getTestDb>>, code: string, tamper: boolean) {
  const player = await createPlayer(db)
  const serverSeed = 'd'.repeat(63) + code.slice(-1)
  const clientSeed = 'hat-giong'
  const run = await insertRun(db, {
    playerId: player.id,
    runCode: code,
    serverSeed,
    commitment: commit(serverSeed),
    clientSeed,
    targetWins: 20,
    maxRounds: 300,
  })

  const trueHand = deriveHand(serverSeed, clientSeed, 0)
  await insertRound(db, {
    runId: run.id,
    nonce: 0,
    playerHand: 0,
    serverHand: (tamper ? ((trueHand + 1) % 3) : trueHand) as Hand,
    outcome: 'lose',
  })
  await updateRunState(db, run.id, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
  return run
}

describe('sweepFinishedRuns', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('quét lượt đã kết thúc và không báo gì khi mọi thứ khớp', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0001', false)
    await makeFinishedRun(db, 'JKN-SWEP-0002', false)

    const report = await sweepFinishedRuns(db, past)
    expect(report.scanned).toBe(2)
    expect(report.mismatched).toEqual([])
  })

  it('báo đúng lượt bị lệch', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0003', false)
    await makeFinishedRun(db, 'JKN-SWEP-0004', true)

    const report = await sweepFinishedRuns(db, past)
    expect(report.scanned).toBe(2)
    expect(report.mismatched).toEqual(['JKN-SWEP-0004'])
  })

  it('quét cả lượt tạo trước cửa sổ nhưng kết thúc bên trong nó', async () => {
    const db = await getTestDb()
    const run = await makeFinishedRun(db, 'JKN-SWEP-0006', false)

    // Tạo từ lâu, vừa mới kết thúc — đúng hình dạng của một người chơi rải lượt
    // qua nhiều ngày. Lọc theo createdAt sẽ bỏ sót vĩnh viễn, vì cửa sổ đêm sau
    // cũng tính từ hiện tại.
    await db
      .update(runs)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z'), endedAt: new Date() })
      .where(eq(runs.id, run.id))

    const report = await sweepFinishedRuns(db, new Date(Date.now() - 3600_000))
    expect(report.scanned).toBe(1)
  })

  it('báo cắt bớt khi chạm trần', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0007', false)
    await makeFinishedRun(db, 'JKN-SWEP-0008', false)

    expect((await sweepFinishedRuns(db, past, 1)).truncated).toBe(true)
    expect((await sweepFinishedRuns(db, past, 50)).truncated).toBe(false)
  })

  it('bỏ qua lượt còn đang active', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    await insertRun(db, {
      playerId: player.id,
      runCode: 'JKN-SWEP-0005',
      serverSeed: 'e'.repeat(64),
      commitment: commit('e'.repeat(64)),
      clientSeed: 'x',
      targetWins: 20,
      maxRounds: 300,
    })

    expect((await sweepFinishedRuns(db, past)).scanned).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- tests/services/audit-sweep.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/services/audit-sweep`.

- [ ] **Step 3: Viết `audit-sweep.ts`**

```ts
// src/lib/services/audit-sweep.ts
import { and, gte, ne } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { runs } from '@/lib/db/schema'
import { verifyRun } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { getLogger } from '@/lib/observability/logger'
import { listRounds } from '@/lib/repo/rounds'
import { lockRun } from '@/lib/repo/runs'

export interface SweepReport {
  scanned: number
  /** Mã của những lượt dựng lại không khớp bản ghi. Rỗng là tốt. */
  mismatched: string[]
  /** true khi chạm trần `limit`, nghĩa là còn lượt chưa được quét trong cửa sổ này. */
  truncated: boolean
}

/**
 * Quét lại toàn bộ lượt đã kết thúc và tính lại tay của máy cho từng ván.
 * Lệch một ván là dấu hiệu bug hoặc dữ liệu bị can thiệp — cảnh báo ngay.
 */
export async function sweepFinishedRuns(db: Db, since: Date, limit = 5000): Promise<SweepReport> {
  // Lọc theo `endedAt`, KHÔNG theo `createdAt`. Một lượt bắt đầu trước cửa sổ mà
  // kết thúc bên trong nó sẽ không bao giờ được quét nếu lọc theo lúc tạo — và
  // không bao giờ theo nghĩa vĩnh viễn, vì cửa sổ đêm sau cũng tính từ hiện tại.
  // Người chơi rải một lượt qua nhiều ngày là chuyện bình thường, nên lọc sai ở
  // đây làm hỏng đúng mục đích của job: phát hiện trước khi người chơi phát hiện.
  const finished = await db
    .select()
    .from(runs)
    .where(and(ne(runs.status, 'active'), gte(runs.endedAt, since)))
    .limit(limit)

  const mismatched: string[] = []

  for (const run of finished) {
    const played = await listRounds(db, run.id)
    const result = verifyRun({
      serverSeed: run.serverSeed,
      clientSeed: run.clientSeed,
      commitment: run.commitment,
      rounds: played.map((r) => ({
        nonce: r.nonce,
        playerHand: r.playerHand as Hand,
        serverHand: r.serverHand as Hand,
        outcome: r.outcome,
      })),
    })

    if (!result.commitmentValid || !result.allRoundsMatch) {
      mismatched.push(run.runCode)
      getLogger().error(
        { runCode: run.runCode, commitmentValid: result.commitmentValid },
        'đối chiếu thất bại — lượt chơi dựng lại không khớp bản ghi',
      )
    }
  }

  const truncated = finished.length === limit
  if (truncated) {
    // Không đổi mã thoát — cắt bớt không phải là lệch. Nhưng phải kêu to, vì im
    // lặng ở đây nghĩa là người vận hành tin rằng đã quét hết trong khi chưa.
    getLogger().warn(
      { limit, since: since.toISOString() },
      'quét chạm trần, còn lượt chưa được đối chiếu trong cửa sổ này',
    )
  }

  return { scanned: finished.length, mismatched, truncated }
}
```

- [ ] **Step 4: Viết `scripts/audit-runs.ts`**

```ts
// scripts/audit-runs.ts
import { createDb } from '@/lib/db/client'
import { logger } from '@/lib/observability/logger'
import { sweepFinishedRuns } from '@/lib/services/audit-sweep'

const LOOKBACK_HOURS = Number(process.env.AUDIT_LOOKBACK_HOURS ?? 48)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')

  const { db, close } = createDb(url, 4)
  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000)
    const report = await sweepFinishedRuns(db, since)

    logger.info({ ...report, since: since.toISOString() }, 'quét đối chiếu xong')

    if (report.truncated) {
      logger.warn(
        { scanned: report.scanned },
        'quét bị cắt bớt — nâng giới hạn hoặc rút ngắn cửa sổ, nếu không phần còn lại không ai kiểm',
      )
    }

    if (report.mismatched.length > 0) {
      logger.error({ mismatched: report.mismatched }, 'CÓ LƯỢT KHÔNG KHỚP — cần điều tra ngay')
      process.exitCode = 1
    }
  } finally {
    await close()
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'quét đối chiếu thất bại')
  process.exit(1)
})
```

- [ ] **Step 5: Thêm script và cho phép alias `@/` chạy ngoài Next**

```json
{
  "scripts": {
    "audit:runs": "tsx --tsconfig tsconfig.json scripts/audit-runs.ts"
  }
}
```

Nếu `tsx` không hiểu alias `@/`, cài `tsconfig-paths` và đổi thành
`tsx -r tsconfig-paths/register scripts/audit-runs.ts`.

- [ ] **Step 6: Chạy test**

Run: `npm test -- tests/services/audit-sweep.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/audit-sweep.ts scripts package.json tests/services/audit-sweep.test.ts
git commit -m "feat(audit): job tự đối chiếu toàn bộ lượt đã kết thúc"
```

---

## Task 19: Trace và báo lỗi

Gói sau một module mỏng để đổi nhà cung cấp chỉ sửa một chỗ, thay vì rải `Sentry.captureException` khắp codebase.

**Files:**
- Create: `src/instrumentation.ts`, `src/lib/observability/errors.ts`
- Modify: `src/lib/http/handler.ts`
- Test: `src/lib/observability/errors.test.ts`

**Interfaces:**
- Consumes: `getContext` từ request-context
- Produces:
  - `function reportError(error: unknown, tags?: Record<string, string | undefined>): void`
  - `function setErrorReporter(reporter: ErrorReporter | null): void`
  - `type ErrorReporter = (error: unknown, tags: Record<string, string>) => void`

- [ ] **Step 1: Viết test**

```ts
// src/lib/observability/errors.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError, setErrorReporter } from './errors'
import { runWithContext } from './request-context'

afterEach(() => setErrorReporter(null))

describe('reportError', () => {
  it('không nổ khi chưa cấu hình nhà cung cấp nào', () => {
    expect(() => reportError(new Error('bùm'))).not.toThrow()
  })

  it('chuyển lỗi kèm khoá tương quan sang nhà cung cấp', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    runWithContext({ requestId: 'req-7', playerId: 'p-1', runId: 'r-1' }, () => {
      reportError(new Error('bùm'), { runCode: 'JKN-AAAA-0001' })
    })

    expect(reporter).toHaveBeenCalledOnce()
    const [, tags] = reporter.mock.calls[0]
    expect(tags).toMatchObject({ requestId: 'req-7', playerId: 'p-1', runId: 'r-1', runCode: 'JKN-AAAA-0001' })
  })

  it('bỏ qua tag rỗng thay vì gửi chuỗi undefined', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    reportError(new Error('bùm'), { runCode: undefined })

    expect(reporter.mock.calls[0][1]).not.toHaveProperty('runCode')
  })

  it('không bao giờ gửi seed ra ngoài dù người gọi có truyền vào', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    reportError(new Error('bùm'), {
      serverSeed: 'BI-MAT-TUYET-DOI',
      ServerSeed: 'BI-MAT-HOA-THUONG',
      runCode: 'JKN-AAAA-0001',
    })

    const [, tags] = reporter.mock.calls[0]
    expect(JSON.stringify(tags)).not.toContain('BI-MAT')
    // Vẫn phải giữ những tag lành tính, nếu không việc chặn thành ra vô dụng.
    expect(tags).toMatchObject({ runCode: 'JKN-AAAA-0001' })
  })

  it('lỗi trong chính nhà cung cấp không làm hỏng request', () => {
    setErrorReporter(() => {
      throw new Error('sentry sập')
    })
    expect(() => reportError(new Error('bùm'))).not.toThrow()
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npm test -- src/lib/observability/errors.test.ts`
Expected: FAIL — không tìm thấy module `./errors`.

- [ ] **Step 3: Viết `src/lib/observability/errors.ts`**

```ts
// src/lib/observability/errors.ts
import { logger } from './logger'
import { getContext } from './request-context'

export type ErrorReporter = (error: unknown, tags: Record<string, string>) => void

/**
 * Khoá không bao giờ được gửi ra ngoài, so sánh không phân biệt hoa thường.
 *
 * Log nội bộ đã có `REDACT_PATHS`, nhưng chỗ này nghiêm hơn một bậc: dữ liệu rời
 * khỏi tầm kiểm soát của người vận hành. Một seed lọt vào kho của bên thứ ba thì
 * không rút lại được, và nó lọt đúng ở đường xử lý lỗi — nơi người ta quen tay
 * nhét thêm ngữ cảnh cho dễ điều tra.
 */
const FORBIDDEN_TAG_KEYS = new Set(['serverseed', 'seed', 'clientsecret', 'sessionsecret'])

let reporter: ErrorReporter | null = null

/** Cắm Sentry (hoặc bất cứ thứ gì) ở đúng một chỗ này. */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next
}

export function reportError(error: unknown, tags: Record<string, string | undefined> = {}): void {
  const context = getContext()
  const merged: Record<string, string> = {}

  for (const [key, value] of Object.entries({ ...context, ...tags })) {
    if (value === undefined || value === null) continue
    if (FORBIDDEN_TAG_KEYS.has(key.toLowerCase())) {
      logger.warn({ key }, 'chặn một khoá cấm không cho gửi ra dịch vụ báo lỗi ngoài')
      continue
    }
    merged[key] = String(value)
  }

  try {
    reporter?.(error, merged)
  } catch (reportingFailure) {
    // Nhà cung cấp sập không được kéo theo request của người chơi.
    logger.warn({ err: reportingFailure }, 'gửi báo lỗi thất bại')
  }
}
```

- [ ] **Step 4: Nối vào handler**

Trong `src/lib/http/handler.ts`, thêm import và gọi ở nhánh lỗi 500:

```ts
import { reportError } from '@/lib/observability/errors'
```

```ts
        getLogger().error({ err: error }, 'lỗi không lường trước')
        reportError(error)
        return jsonResponse({ error: 'internal_error' }, 500, setCookie, requestId)
```

- [ ] **Step 5: Viết `src/instrumentation.ts`**

```ts
// src/instrumentation.ts
import { logger } from '@/lib/observability/logger'

/**
 * Bề mặt tối thiểu chúng ta thật sự dùng của Sentry.
 *
 * Khai báo tại chỗ thay vì `typeof import('@sentry/node')` để typecheck không cần
 * gói đó có mặt — nó là phụ thuộc tuỳ chọn, chỉ cài khi bật Sentry.
 */
interface SentryLike {
  init(options: Record<string, unknown>): void
  withScope(callback: (scope: { setTags(tags: Record<string, string>): void }) => void): void
  captureException(error: unknown): void
}

// Next.js gọi hàm này một lần khi server khởi động.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  const { setErrorReporter } = await import('@/lib/observability/errors')

  // Specifier gián tiếp, KHÔNG phải chuỗi literal. Turbopack phân giải tĩnh mọi
  // import có literal để chia chunk, kể cả trong nhánh không bao giờ chạy tới —
  // nên để literal ở đây làm `next build` hỏng trên mọi triển khai KHÔNG dùng
  // Sentry, ngược hẳn ý đồ "không đặt DSN thì bỏ qua". Đã kiểm chứng: build báo
  // "Module not found: Can't resolve '@sentry/node'".
  const specifier = process.env.SENTRY_MODULE ?? '@sentry/node'

  try {
    const Sentry = (await import(specifier)) as unknown as SentryLike

    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NODE_ENV,
    })

    setErrorReporter((error, tags) => {
      Sentry.withScope((scope) => {
        scope.setTags(tags)
        Sentry.captureException(error)
      })
    })
  } catch (error) {
    // Đặt DSN mà chưa cài gói thì phải kêu to rồi chạy tiếp không có Sentry.
    // Sập ở đây nghĩa là một biến môi trường cấu hình sai làm chết cả app.
    logger.error({ err: error }, 'không nạp được Sentry, chạy tiếp không có báo lỗi từ xa')
  }
}
```

Cài khi bật Sentry: `npm install @sentry/node`. Không đặt `SENTRY_DSN` thì khối này bỏ qua ngay từ
dòng thứ hai, và vì specifier không phải chuỗi literal nên bundler cũng không đi tìm gói — `next
build` chạy bình thường trên một cây phụ thuộc không có Sentry.

Cách này trông vòng vo hơn một `import('@sentry/node')` thẳng, và nó vòng vo có lý do: bản thẳng
làm `next build` hỏng với `Module not found` trên mọi triển khai không dùng Sentry, vì Turbopack
phân giải tĩnh literal để chia chunk bất kể nhánh có chạy tới hay không.

`@sentry/node` tự bật OpenTelemetry cho trace HTTP và Postgres. Muốn đẩy trace sang backend khác (Tempo, Jaeger) thì thay khối `Sentry.init` bằng OTel SDK — điểm nối vẫn là `setErrorReporter`, không có chỗ nào khác trong codebase phải sửa.

- [ ] **Step 6: Chạy test và typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/observability src/instrumentation.ts src/lib/http/handler.ts
git commit -m "feat(observability): điểm nối báo lỗi duy nhất và khởi tạo Sentry tuỳ chọn"
```

---

## Task 20: Đóng gói và triển khai lên Coolify

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docs/deploy-coolify.md`
- Create: `src/lib/db/migrate.ts`, `scripts/migrate.ts`
- Modify: `next.config.ts`, `tests/helpers/test-db.ts`, `package.json`

- [ ] **Step 0: Gom bộ chạy migration về một chỗ**

Task 6 đặt bộ đọc và chạy file `.sql` bên trong helper test. Production cần đúng logic ấy, vì
`drizzle-kit migrate` bỏ qua các file viết tay không có trong `meta/_journal.json` — mà index
một-lượt-active chính là một file như vậy. Hai bản sao của cùng một logic thì sớm muộn cũng lệch
nhau, và lần lệch đó sẽ là lần production thiếu ràng buộc.

Tách thành module dùng chung:

```ts
// src/lib/db/migrate.ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import type { Db } from './client'

/**
 * Chạy mọi file .sql trong drizzle/ theo thứ tự tên.
 *
 * Cố ý không dùng drizzle-kit migrate: nó chỉ chạy những migration có đăng ký
 * trong meta/_journal.json, nên sẽ bỏ qua các file viết tay như
 * 0001_partial_indexes.sql — và bỏ qua im lặng.
 */
export async function runMigrations(db: Db, dir = join(process.cwd(), 'drizzle')): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const statements = readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')
    for (const statement of statements) {
      const trimmed = statement.trim()
      if (trimmed) await db.execute(sql.raw(trimmed))
    }
  }
  return files
}
```

```ts
// scripts/migrate.ts
import { createDb } from '@/lib/db/client'
import { runMigrations } from '@/lib/db/migrate'
import { logger } from '@/lib/observability/logger'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('thiếu biến môi trường DATABASE_URL')

  const { db, close } = createDb(url, 2)
  try {
    const applied = await runMigrations(db)
    logger.info({ applied }, 'chạy migration xong')
  } finally {
    await close()
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'chạy migration thất bại')
  process.exit(1)
})
```

Sửa `tests/helpers/test-db.ts` để gọi `runMigrations` thay vì bản sao cục bộ, và thêm script:

```json
{ "scripts": { "db:migrate": "tsx scripts/migrate.ts" } }
```

Chạy `npm test -- tests/db/schema.test.ts` và xác nhận test "chặn người chơi có hai lượt active"
vẫn pass — nếu nó fail thì `runMigrations` chưa áp được file viết tay.

- [ ] **Step 1: Bật standalone output**

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

- [ ] **Step 2: Viết `.dockerignore`**

```
node_modules
.next
.git
docs
tests
e2e
*.test.ts
```

- [ ] **Step 2b: Biên dịch sẵn hai script trước khi đóng gói**

Hai script vận hành (`migrate`, `audit-runs`) chạy bằng `tsx` khi phát triển. Nếu để nguyên như vậy
trong image thì tầng runner phải mang theo `tsx`, `tsconfig.json`, cả `src/` và toàn bộ
`node_modules` kể cả devDependencies — image phình lên gần 1GB và production ôm theo `vitest`,
`playwright`, `drizzle-kit`. Chưa kể nếu thiếu bất kỳ mảnh nào thì lệnh pre-deployment chết với
`tsx: not found`, tức migration không chạy.

Gộp mỗi script thành một file JS tự chứa ngay ở tầng builder:

```bash
npm install -D esbuild
```

```json
{
  "scripts": {
    "build:scripts": "esbuild scripts/migrate.ts scripts/audit-runs.ts --bundle --platform=node --target=node22 --format=cjs --outdir=dist/scripts --tsconfig=tsconfig.json"
  }
}
```

`--tsconfig` để esbuild đọc `paths` và tự phân giải alias `@/`. Sau bước này tầng runner chỉ cần
`node` cùng hai file trong `dist/scripts` — không `tsx`, không `tsconfig`, không `src/`.

Chạy `npm run build:scripts` rồi `node dist/scripts/migrate.js` với `DATABASE_URL` trỏ vào Postgres
cục bộ và xác nhận nó áp được migration, trước khi tin vào Dockerfile.

- [ ] **Step 3: Viết `Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migration và job đối chiếu chạy trong cùng image, dưới dạng JS đã gộp sẵn —
# nên tầng này KHÔNG cần tsx, tsconfig.json hay src/. Thiếu một trong số đó thì
# lệnh pre-deployment chết với `tsx: not found` và database không được migrate.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/dist/scripts ./dist/scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

- [ ] **Step 4: Kiểm tra image chạy được, không chỉ build được**

```bash
docker build -t janken:local .
docker run --rm -e DATABASE_URL=postgres://x:x@127.0.0.1:1/x janken:local node dist/scripts/migrate.js
docker run --rm -e DATABASE_URL=postgres://x:x@127.0.0.1:1/x janken:local node dist/scripts/audit-runs.js
```

Expected: build thành công; hai lệnh sau **thất bại vì `ECONNREFUSED`**, không phải vì `not found`
hay `Cannot find module`. Phân biệt này là toàn bộ mục đích của bước kiểm tra: chạm được tới
database rồi mới hỏng nghĩa là script đã nạp đủ; hỏng ở khâu phân giải module nghĩa là image thiếu
thứ gì đó và migration sẽ không bao giờ chạy trên production.

Kiểm luôn kích thước: `docker images janken:local`. Vượt quá vài trăm MB nghĩa là devDependencies
đã lọt vào tầng runner.

- [ ] **Step 5: Viết `docs/deploy-coolify.md`**

```markdown
# Triển khai lên Coolify

## Tài nguyên cần tạo

1. **Postgres 16** — tạo từ mục Databases của Coolify. Lấy connection string nội bộ.
2. **Redis 7** — tạo từ mục Databases. Chỉ dùng cho rate limit; mất Redis thì game vẫn chạy.
3. **Application** — nguồn là repo GitHub này, build bằng Dockerfile, cổng 3000.

## Biến môi trường

| Biến | Ghi chú |
|---|---|
| `DATABASE_URL` | Connection string nội bộ của Postgres |
| `REDIS_URL` | Connection string nội bộ của Redis |
| `SESSION_SECRET` | Sinh bằng `openssl rand -hex 32`. Đổi giá trị này là mọi session hiện có mất hiệu lực |
| `IP_HASH_SALT` | Sinh bằng `openssl rand -hex 32`. Không bao giờ đổi sau khi chạy thật, đổi là mất khả năng nhóm hành vi theo IP trong dữ liệu cũ |
| `ADMIN_TOKEN` | Token cho trang `/admin`. Sinh ngẫu nhiên |
| `TARGET_WINS` | Mặc định 20 |
| `MAX_ROUNDS_PER_RUN` | Mặc định 300 |
| `ATTEMPTS_PER_DAY` | Mặc định 0 (không giới hạn) |
| `SENTRY_DSN` | Tuỳ chọn. Bỏ trống thì không bật báo lỗi |
| `LOG_LEVEL` | Mặc định `info` |

## Chạy migration

Đặt ở mục Pre-deployment Command của application:

```
node dist/scripts/migrate.js
```

Trong image dùng đường dẫn tới file đã gộp, không dùng `npm run db:migrate` — script npm đó gọi
`tsx`, vốn là devDependency và cố tình không có mặt ở tầng runner.

**Không dùng `npx drizzle-kit migrate`.** Index một-lượt-active (`drizzle/0001_partial_indexes.sql`)
được viết tay, không nằm trong `drizzle/meta/_journal.json`, nên drizzle-kit sẽ bỏ qua nó. Chạy
lệnh đó lên production sẽ dựng đủ bảng nhưng **thiếu đúng cái ràng buộc chặn một người chơi có hai
lượt cùng lúc** — và thiếu một cách im lặng, chỉ lộ ra khi có người khai thác.

## Job đối chiếu hằng đêm

Tạo Scheduled Task trong Coolify:

- Lịch: `0 3 * * *`
- Lệnh: `node dist/scripts/audit-runs.js`

Job trả về mã thoát khác 0 khi phát hiện lượt không khớp — cấu hình cảnh báo của Coolify bám vào đó.

## Sau khi deploy

1. Mở `/stats`, xác nhận trang lên được và đang kết nối DB.
2. Chơi thử một lượt cho tới khi thua, bấm "Tự kiểm chứng lượt này", xác nhận mã niêm phong KHỚP.
3. Gọi `/admin/runs/<mã>` kèm header `x-admin-token`, xác nhận dựng lại đầy đủ.
4. Xác nhận log không chứa `serverSeed`: `docker logs <container> | grep -c serverSeed` phải trả về 0.
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore next.config.ts docs/deploy-coolify.md
git commit -m "chore(deploy): đóng gói standalone và hướng dẫn triển khai Coolify"
```

---

## Task 21: Kiểm thử đầu-cuối

Một kịch bản duy nhất, nhưng nó chứng minh vòng khép kín: chơi thật, seed được công bố, người chơi tự kiểm chứng thành công.

**Files:**
- Create: `playwright.config.ts`, `e2e/play-and-verify.spec.ts`

- [ ] **Step 1: Cài Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Viết `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Viết kịch bản**

```ts
// e2e/play-and-verify.spec.ts
import { expect, test } from '@playwright/test'

test('chơi tới khi hết lượt rồi tự kiểm chứng thành công', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('gõ gì cũng được').fill('hat-giong-e2e')
  await page.getByRole('button', { name: 'Bắt đầu lượt mới' }).click()

  // Mã niêm phong phải hiện ra TRƯỚC khi bấm ván đầu tiên.
  await expect(page.getByText('Mã niêm phong (SHA-256 của hạt giống máy)')).toBeVisible()
  await expect(page.getByText('Hạt giống của máy (đã công bố)')).toHaveCount(0)

  // Bấm liên tục cho tới khi lượt kết thúc. Trung bình hai ván là thua.
  for (let i = 0; i < 400; i++) {
    const playButton = page.getByRole('button', { name: 'kéo', exact: true })
    if (!(await playButton.isVisible().catch(() => false))) break

    // Kiểm lại ở MỖI vòng, không chỉ một lần trước vòng lặp. Một lỗi làm lộ seed
    // từ ván thứ hai trở đi sẽ lọt qua phép kiểm chỉ chạy lúc t=0.
    await expect(page.getByText('Hạt giống của máy (đã công bố)')).toHaveCount(0)

    await playButton.click()
    await page.waitForTimeout(60)
  }

  await expect(page.getByRole('button', { name: 'Chơi lượt mới' })).toBeVisible()
  await expect(page.getByText('Hạt giống của máy (đã công bố)')).toBeVisible()

  // Lượt mới phải xoá sạch seed của lượt trước. Kiểm bằng mắt không bắt được lỗi
  // này vì nó chỉ lộ ra khi chơi lượt thứ hai sau khi đã xong lượt thứ nhất.
  await page.getByRole('button', { name: 'Chơi lượt mới' }).click()
  await expect(page.getByText('Hạt giống của máy (đã công bố)')).toHaveCount(0)
  await page.reload()

  await page.getByRole('link', { name: 'Tự kiểm chứng lượt này' }).click()
  // Danh sách ván phải được điền sẵn từ link, nếu không trang chỉ đối chiếu được
  // cam kết và toàn bộ phần dựng lại từng tay không hề chạy.
  await expect(page.getByPlaceholder('[{"nonce":0')).not.toHaveValue('')

  await page.getByRole('button', { name: 'Kiểm chứng' }).click()

  // Cam kết khớp.
  await expect(page.getByText('Mã niêm phong:')).toBeVisible()
  await expect(page.getByText('KHÔNG KHỚP')).toHaveCount(0)

  // Và từng ván được dựng lại rồi đối chiếu — đây mới là điều sản phẩm hứa.
  // Thiếu khẳng định này thì test chỉ chứng minh một phép so hash.
  await expect(page.getByText('TẤT CẢ KHỚP')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('LỆCH')).toHaveCount(0)
})
```

- [ ] **Step 4: Thêm script**

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 5: Chạy**

```bash
docker compose up -d
npm run test:e2e
```

Expected: PASS, 1 test.

- [ ] **Step 6: Chạy toàn bộ trước khi đóng**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test(e2e): chơi trọn một lượt rồi tự kiểm chứng"
```

---

## Kiểm tra sau khi xong toàn bộ

Trước khi coi MVP là hoàn tất, xác nhận từng dòng dưới đây bằng cách chạy thật:

- [ ] `npm test` xanh toàn bộ, không có test nào bị skip.
- [ ] `npm run typecheck` không lỗi.
- [ ] `npm run build` thành công.
- [ ] `npm run test:e2e` xanh.
- [ ] File snapshot golden vector chưa từng bị cập nhật kể từ commit đầu tiên:
      `git log --oneline -- src/lib/fairness/__snapshots__` chỉ có đúng một commit.
- [ ] Chơi thật một lượt trên môi trường đã deploy, kiểm chứng thành công.
- [ ] Log không chứa `serverSeed` ở bất kỳ đâu.

## Việc thuộc v2, cố tình không làm ở MVP

Đăng nhập (cột `account_id` đã chờ sẵn) · trao thưởng và kho quà · bảng xếp hạng công khai · mốc thưởng 5/10/15 · chia sẻ nhận thêm lượt · hiệu ứng và âm thanh.

**Nhắc lại lời cảnh báo từ spec:** đừng bật phần thưởng có giá trị thật khi còn ẩn danh 100%. Bot không bẻ được kết quả, nhưng nó mua thêm lượt được — mà với xác suất một phần triệu thì mua đủ nhiều là trúng. Phần thưởng bật cùng lúc với đăng nhập.
