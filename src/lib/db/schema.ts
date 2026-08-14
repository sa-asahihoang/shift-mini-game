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
