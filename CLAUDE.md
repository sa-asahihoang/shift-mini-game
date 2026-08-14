# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A provably-fair rock-paper-scissors streak game. Next.js 16 App Router, TypeScript strict,
Postgres via Drizzle, Redis for rate limiting.

**Language split — keep it that way.** All user-facing copy is in **English**; **code comments and
commit messages stay in Vietnamese**. That includes the admin page, so there is one rule to remember
rather than a per-page judgement call. E2E specs select on English UI strings while their own
comments and test titles stay Vietnamese.

The whole project exists to make one claim checkable by the player: the server cannot pick its
hand after seeing yours.

1. On `POST /api/runs` the server generates `serverSeed` and returns only `SHA256(serverSeed)`
   (the *commitment*). The player supplies their own `clientSeed`, or gets a random one.
2. Round `n`'s server hand is `HMAC-SHA256(serverSeed, "clientSeed:n") mod 3`, with rejection
   sampling so `mod 3` carries no bias.
3. When the run ends (win, loss, cap, or abandon) the seed is revealed. `/verify` recomputes
   every hand **in the browser** — it never asks the server anything.

## Invariants a change must not break

- **`serverSeed` never leaves the process while a run is `active`.** Not in a response body, not
  in a log line, not in an error tag. `tests/api/runs.test.ts` locks the exact key set of the
  start-run response for this reason; `src/lib/observability/errors.ts` blocks any tag key
  containing `seed` or `secret` before it reaches an external reporter.
- **`rounds` and `audit_events` are append-only.** They are the dispute ledger. Never update or
  delete a row; adding a rate limiter in front of any route that writes to them is the way to
  bound growth.
- **`src/lib/fairness/__snapshots__/derive.test.ts.snap` is a permanent golden vector.** Never run
  vitest with `-u` / `--update`. If it fails, the code is wrong, not the snapshot. Changing what
  `deriveHand` or `commit` computes makes every historical run unverifiable.
- **The verify page must stay pure client-side.** A verification that asks the server to confirm
  itself proves nothing.
- **The game screen carries no explanatory copy.** `/` shows only what you need to play; every
  argument about fairness lives on `/how-it-works`. One exception, and it is deliberate: the
  commitment strip under the board has no prose but must stay *visible* before the first tap —
  publishing the commitment up front is the whole promise, and `e2e/play-and-verify.spec.ts` locks
  it.
- **`runs.status` / `runs.wins` must always be re-derivable from the rounds ledger** via
  `checkStoredRunState`. Both `inspectRun` and the nightly sweep assert this; a green admin page
  is supposed to mean the totals were checked, not just the individual hands.
- Config captured at run creation (`targetWins`, `maxRounds`) is what that run replays against —
  never re-read the current env when verifying an old run.

## Commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Postgres + Redis for local dev |
| `npm run db:migrate` | Apply migrations (dev; uses `tsx`) |
| `npm run dev` | Dev server on :3000 |
| `npm test` | Vitest. Integration tests start their own Postgres via testcontainers — Docker must be running |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm run build` | Production build |
| `npm run test:e2e` | Playwright, boots `npm run dev` itself |
| `npm run audit:runs` | Re-verify finished runs; exits non-zero on mismatch |

## Layout

```
src/lib/fairness/    seed generation, commitment, deriveHand, verifyRun — pure, no I/O
src/lib/game/        hands + judge, applyOutcome, checkStoredRunState — pure state machine
src/lib/db/          drizzle schema, client, migration runner
src/lib/repo/        thin data access, one file per table
src/lib/services/    start-run, play-round, abandon-run, inspect-run, audit-sweep
src/lib/http/        withRequest wrapper, session cookie resolution, zod schemas
src/lib/rate-limit/  Redis limiter with in-memory fallback
src/app/api/         route handlers, all wrapped in withRequest
src/app/how-it-works/  the player-facing explanation — picture-led, no jargon
src/components/      GameBoard, CommitmentPanel, VerifyForm (client components)
drizzle/             hand-ordered .sql files; the runner scans the directory, not the journal
```

Rules that hold across layers:

- Every API route goes through `withRequest`: request id, IP rate limit *before* session
  resolution, session cookie, typed error → HTTP status, `Cache-Control: no-store`.
- Services own transactions; repos never open one. `recordRejection` must be called with the
  **root** connection, never a transaction handle — a rolled-back transaction takes the audit row
  with it.
- Migrations: `drizzle/0001_partial_indexes.sql` is deliberately absent from
  `drizzle/meta/_journal.json`, so `drizzle-kit migrate` would silently skip the index that
  enforces one active run per player. Use `runMigrations`, which scans the directory and records
  applied files in `_migrations`.

## Conventions

- Conventional commits, Vietnamese subject lines. Commit in logical chunks.
- TypeScript strict, no `any`.
- Comments explain *why*, especially the non-obvious ordering constraints — several of them are
  load-bearing (seed reveal ordering in `GameBoard.play`, audit outside the transaction, win check
  before the round cap in `applyOutcome`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
