---
name: ai-core/persistence
description: >
  Durable, resumable chat() via withPersistence middleware and AIPersistence.
  Persists thread messages, run records, append-only AG-UI public events,
  internal CAS/checkpoint events, interrupts, metadata, locks, and artifacts
  through optional feature-validated stores. Stamps chunks with opaque cursors;
  chat({ cursor }) replays the public event tail, and RunAgentInput.resume[]
  resolves pending interrupts. Backends: memoryPersistence, sqlitePersistence,
  postgresPersistence, cloudflarePersistence, drizzlePersistence,
  prismaPersistence (shared SQL core).
type: sub-skill
library: tanstack-ai
library_version: '0.30.0'
sources:
  - 'TanStack/ai:docs/persistence/overview.md'
---

# Persistence

> **Dependency note:** This skill builds on ai-core and ai-core/middleware. Read those first.

## Core rules

- Persistence is **opt-in middleware** and fully optional. A `chat()` with no
  persistence middleware is unchanged.
- The primary interface is `AIPersistence`; use `defineAIPersistence(...)` for
  custom stores. `ChatPersistence` / `defineChatPersistence` are deprecated
  compatibility aliases only.
- `withPersistence(persistence, { features? })` maps onto the real middleware
  hooks: `setup` (create/resume run + validate features), `onConfig`
  (load+merge thread messages, server-authoritative), `onChunk` (assign
  per-run seq, stamp in-band `cursor`, append to the public event log), and
  `onFinish`/`onError`/`onAbort` (run status + usage + transcript save).
- The public replay log is the AG-UI `StreamChunk` stream itself. Internal
  CAS/checkpoint events are separate and go through `InternalEventStore`; do
  not mix internal package state into public stream replay.
- A `cursor` is opaque (a monotonic per-run sequence). Pass the client's last
  cursor as `chat({ cursor })` to replay the tail after it. Do NOT parse it.
- Durable replay state is `{ threadId, runId, cursor }`. Persist all three for
  full page reload recovery.
- Pending user-actionable interrupts are represented by
  `RUN_FINISHED.outcome.type === 'interrupt'`, persisted in `InterruptStore`,
  and resumed with AG-UI `RunAgentInput.resume[]`. Normal new input on the same
  thread is blocked by default while pending interrupts exist.

## Server - persisted, resumable endpoint

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
})

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor, resume } = await request.json()
  const stream = chat({
    threadId,
    runId,
    cursor,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

## Client - auto-resume

`useChat` auto-resumes by default (`autoResume: false` to opt out). The React
hook exposes `chat.resumeState` for `{ threadId, runId, cursor }` and
`chat.resume()` to continue replay on demand.

For pending interrupts, send resume entries matching every pending interrupt
with `resumeInterrupts(...)`:

```ts
await chat.resumeInterrupts([
  {
    interruptId: 'interrupt-1',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

## Stores and features

`AIPersistence` stores are optional, but feature validation is fail-loud:

| Feature           | Required stores                      |
| ----------------- | ------------------------------------ |
| `messages`        | `messages`                           |
| `durable-replay`  | `runs`, `publicEvents`               |
| `interrupts`      | `runs`, `publicEvents`, `interrupts` |
| `internal-events` | `internalEvents`                     |
| `metadata`        | `metadata`                           |
| `locks`           | `locks`                              |
| `artifacts`       | `artifacts`                          |

## Backends

```ts
import { memoryPersistence } from '@tanstack/ai-persistence' // tests/prototypes
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite' // { path } | { db }
import { postgresPersistence } from '@tanstack/ai-persistence-postgres' // { connectionString } | { client }
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle' // { db, dialect }
import { prismaPersistence } from '@tanstack/ai-persistence-prisma' // { prisma, dialect }
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare' // { d1 }
```

Raw drivers auto-migrate (opt out with `{ migrate: false }` + the exported
`migrate`/`ddl`). Drizzle and Prisma own their schema. The base SQL schema is
small: `runs`, `public_events`, `internal_events`, `messages`, `interrupts`,
`metadata`, and `_tanstack_ai_migrations`.

## MCP and workflow persistence

MCP persistence is app-owned metadata plus raw public stream replay. Use
`MetadataStore` for app/session correlation; the base schema does not add
MCP-specific tables. Workflow extensions are deferred to optional packages and
should reuse the existing primitives without adding base schema cost.

## Sandboxes

`@tanstack/ai-sandbox-persistence` provides `createSqlSandboxStore(driver)` and
`withPersistenceBridge({ persistence, sandboxStore })`; order it between
`withPersistence` and `withSandbox` to make sandbox resume + ensure-locking
durable across processes. The shared `locks` capability lives in `@tanstack/ai`.

## Gotchas

- `ModelMessage` has no id; message reconciliation is whole-transcript and
  server-authoritative (client messages win when present, else stored history).
- Replaying a run does NOT re-run the adapter; a still-running harness adapter
  (`supportsReattach`) continues live after the replay.
- Custom middleware that returns a chunk must spread it (`{ ...chunk }`) so the
  in-band `cursor` survives.
- Approval custom events are legacy compatibility/projection. Primary
  actionable waits are `RUN_FINISHED.outcome.type === 'interrupt'`.
