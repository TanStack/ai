---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-sql': minor
'@tanstack/ai-persistence-sqlite': minor
'@tanstack/ai-persistence-postgres': minor
'@tanstack/ai-persistence-cloudflare': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-sandbox': minor
---

Persistence + resumable runs as composable `chat()` middleware.

`withPersistence(...)` makes any run durable: it loads/saves thread message
history (server-authoritative), creates/updates run records, persists every
AG-UI `StreamChunk` to an append-only public event log, and persists usage. It
is fully **optional** - a `chat()` with no persistence middleware is unchanged.
The primary API is `AIPersistence` / `defineAIPersistence`; `ChatPersistence` /
`defineChatPersistence` remain deprecated compatibility aliases.

**Resume.** Each persisted chunk carries an in-band, opaque `cursor` (a
monotonic per-run sequence). A client that disconnects mid-run reconnects with
`{ threadId, runId, cursor }`; `chat({ cursor })` replays the persisted public
event tail after that cursor. The public chat hooks expose resume state and a
manual `resume()` helper, with automatic resume behavior enabled unless
`autoResume` is opted out.

**Interrupts.** Actionable waits are represented by
`RUN_FINISHED.outcome.type === 'interrupt'` and resumed with AG-UI
`RunAgentInput.resume[]`. Pending user-actionable interrupts block normal new
input on the same thread by default. Approval custom events are legacy
compatibility/projection only.

**Event model.** Public stream events are separate from internal CAS/checkpoint
events. `PublicEventStore` replays the AG-UI `StreamChunk` stream itself;
`InternalEventStore` stores package-owned checkpoints that must not leak into
public replay. Optional feature validation fails loudly when a requested feature
is missing its required stores.

**Backends (shared SQL core + thin adapters).** One SQL implementation behind a
minimal `SqlDriver` (`@tanstack/ai-persistence-sql`), with dialect support for
SQLite, Postgres, and MySQL and backends for SQLite (`-sqlite`,
node:sqlite/better-sqlite3), Postgres (`-postgres`, pg), Cloudflare D1
(`-cloudflare`, with R2-backed `BlobStore`, D1-indexed R2 artifacts, and
concrete Durable Object locks), and bring-your-own Drizzle (`-drizzle`) and
Prisma (`-prisma`). The shared SQL core emits MySQL-safe DDL and conflict
handling (binary key columns, `LONGTEXT` persisted payloads, and no-op
`ON DUPLICATE KEY UPDATE` idempotent inserts). Raw drivers auto-migrate the
small base schema (`runs`, `public_events`, `internal_events`, `messages`,
`interrupts`, `metadata`, `_tanstack_ai_migrations`); ORMs own their schema.
Cloudflare artifact metadata is lazily indexed in D1 while artifact bytes and
generic blobs live in R2, with optional artifact/blob cleanup APIs for deletion
and garbage collection.
`memoryPersistence()` ships in core for tests/examples.

**Sandboxes, MCP, and workflows.** `@tanstack/ai-sandbox` now consumes
configured persistence capabilities directly. Place `withPersistence(...)`
before `withSandbox(...)` and sandbox resume records are stored in persistence
metadata while sandbox ensure-locking uses the shared persistence lock
capability when present. MCP persistence is app-owned metadata plus raw stream
replay only. Workflow extensions are deferred to optional packages and should
reuse these primitives without adding base schema cost.
