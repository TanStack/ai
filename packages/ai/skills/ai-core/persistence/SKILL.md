---
name: ai-core/persistence
description: >
  Durable, resumable chat() via withPersistence middleware. Persists thread
  messages, run records, an append-only AG-UI event log, usage, approvals, and
  artifacts. Stamps each chunk with an opaque resume cursor; chat({ cursor })
  replays the event tail and (for harness adapters) re-attaches live. Backends:
  memoryPersistence, sqlitePersistence, postgresPersistence, cloudflarePersistence,
  drizzlePersistence, prismaPersistence (shared SQL core). Use for resumable
  conversations, multi-device threads, audit/history, and agent-mode sandboxes.
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
  persistence middleware is unchanged. It works with AND without a sandbox.
- `withPersistence(persistence, { mode? })` maps onto the real middleware hooks:
  `setup` (create/resume run + provide capabilities), `onConfig` (load+merge
  thread messages, server-authoritative), `onChunk` (assign per-run seq, stamp
  in-band `cursor`, append to the event log), `onFinish`/`onError`/`onAbort`
  (run status + usage + transcript save).
- The persisted log is the AG-UI `StreamChunk` stream itself — there is NO
  separate event type. Agent activity rides on well-known `CUSTOM` events
  (`CUSTOM_EVENT.FILE_CHANGED`, `PROCESS_STDOUT`, `APPROVAL_REQUESTED`, …,
  exported from `@tanstack/ai`).
- A `cursor` is opaque (a monotonic per-run sequence). Pass the client's last
  cursor as `chat({ cursor })` to replay the tail after it. Do NOT parse it.
- `mode`: `'messages'` (history only) | `'chat'` (messages + runs + events +
  usage) | `'agent'` (+ sandbox records, approvals, artifacts).

## Server — persisted, resumable endpoint

```ts
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic/adapters'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({ path: '.tanstack-ai/state.sqlite', mode: 'chat' })

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor } = await request.json()
  return chat({
    threadId,
    runId,
    cursor,
    adapter: anthropicText({ model: 'claude-sonnet-4-6' }),
    messages,
    middleware: [withPersistence(persistence)],
  }).toResponse()
}
```

## Client — auto-resume

`useChat` auto-resumes by default (`autoResume: false` to opt out). The headless
client tracks the cursor; `chat.maybeAutoResume()` (call on mount / online),
`chat.resume()`, and `chat.getResumeState()` drive it.

## Backends

```ts
import { memoryPersistence } from '@tanstack/ai-persistence'          // tests/prototypes
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'   // { path } | { db }
import { postgresPersistence } from '@tanstack/ai-persistence-postgres' // { connectionString } | { client }
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle' // { db, dialect }
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'   // { prisma, dialect }
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare' // { d1, durableObjects?, r2? }
```

Raw drivers auto-migrate (opt out with `{ migrate: false }` + the exported
`migrate`/`ddl`). Drizzle and Prisma own their schema.

## Agent mode (sandboxes)

`@tanstack/ai-sandbox-persistence` provides `createSqlSandboxStore(driver)` and
`withPersistenceBridge({ persistence, sandboxStore })` — order it between
`withPersistence` and `withSandbox` to make sandbox resume + ensure-locking
durable across processes. The shared `locks` capability lives in `@tanstack/ai`.

## Gotchas

- `ModelMessage` has no id; message reconciliation is whole-transcript and
  server-authoritative (client messages win when present, else stored history).
- Replaying a run does NOT re-run the adapter; a still-running harness adapter
  (`supportsReattach`) continues live after the replay.
- Custom middleware that returns a chunk must spread it (`{ ...chunk }`) so the
  in-band `cursor` survives.
