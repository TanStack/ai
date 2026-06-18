---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': patch
'@tanstack/ai-client': minor
'@tanstack/ai-claude-code': patch
'@tanstack/ai-codex': patch
'@tanstack/ai-gemini-cli': patch
'@tanstack/ai-opencode': patch
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-sql': minor
'@tanstack/ai-persistence-sqlite': minor
'@tanstack/ai-persistence-postgres': minor
'@tanstack/ai-persistence-cloudflare': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-sandbox-persistence': minor
---

Persistence + resumable runs as composable `chat()` middleware.

`withPersistence(...)` makes any run durable: it loads/saves thread message history (server-authoritative), creates/updates run records, persists every AG-UI `StreamChunk` to an append-only event log, and persists usage. It is fully **optional** — a `chat()` with no persistence middleware is byte-for-byte unchanged, and it works for both non-sandbox and sandbox (agent-mode) runs.

**Resume.** Each persisted chunk carries an in-band, opaque `cursor` (a monotonic per-run sequence). A client that disconnects mid-run reconnects with the run's `runId` + last `cursor`; `chat({ cursor })` replays the persisted event tail after that cursor, then — for harness adapters that re-attach to their still-running in-sandbox process — continues live. The headless `ChatClient` tracks the cursor and exposes `resume()` / `getResumeState()` / `maybeAutoResume()` with an `autoResume` opt-out.

**Event model.** The persisted log is the AG-UI `StreamChunk` stream itself (no parallel event type); agent activity (file changes, process output, approvals, artifacts, sandbox lifecycle) rides on well-known `CUSTOM` events catalogued in `@tanstack/ai`.

**Backends (shared SQL core + thin adapters).** One SQL implementation behind a minimal `SqlDriver` (`@tanstack/ai-persistence-sql`), with backends for SQLite (`-sqlite`, node:sqlite/better-sqlite3), Postgres (`-postgres`, pg), Cloudflare D1 (`-cloudflare`), and bring-your-own Drizzle (`-drizzle`) and Prisma (`-prisma`). Raw drivers auto-migrate (versioned, opt-out); ORMs own their schema. `memoryPersistence()` ships in core for tests/examples.

**Agent mode.** `@tanstack/ai-sandbox-persistence` bridges a durable SQL-backed `SandboxStore` and the durable `LockStore` into `withSandbox`, so sandbox resume and ensure-locking survive across processes. The shared `locks` capability now lives in `@tanstack/ai` (one token across the sandbox and persistence layers); `@tanstack/ai-sandbox` re-exports it for back-compat.

Approvals are persisted and a durable approval controller feeds decisions back into the existing deny-and-replay flow. Cloudflare is compile-verified (Workers runtime), Postgres runtime-verification is via Docker, and live harness re-attach is verified with the real CLIs; everything else is unit/integration-tested. The Playwright E2E suite is a follow-up.
