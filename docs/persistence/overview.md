---
title: Persistence Overview
id: overview
---

Persistence makes a `chat()` run **durable** and **resumable** without changing
how you write `chat()`. It is composable middleware, so it is entirely optional:
a run with no persistence middleware behaves exactly as before.

`withPersistence(...)`:

- loads and saves the thread's message history (the server is authoritative),
- records each run (status, usage, errors),
- appends every streamed AG-UI event to an append-only **public event log**,
- stamps each streamed chunk with an opaque **cursor** so a disconnected client
  can resume,
- validates optional stores fail-loud when a feature requires them,
- and stores pending user-actionable interrupts so they can be resumed safely.

The primary extension point is `AIPersistence`, usually built with
`defineAIPersistence(...)` or a backend factory such as `sqlitePersistence(...)`.
The older `ChatPersistence` / `defineChatPersistence` names remain as deprecated
compatibility aliases only.

## Installation

Pick a backend. SQLite is the simplest durable option:

```sh
npm install @tanstack/ai-persistence @tanstack/ai-persistence-sqlite
```

Other backends: `@tanstack/ai-persistence-postgres`, `-cloudflare`, `-drizzle`,
`-prisma`. For tests and prototypes, `memoryPersistence()` ships in
`@tanstack/ai-persistence`.

## Server: a persisted, resumable endpoint

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

// Build once and reuse across requests.
const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
})

export async function POST(request: Request) {
  // `runId` is reused on replay; `cursor` is present only when replaying.
  // `resume` carries AG-UI interrupt responses for pending actionable waits.
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

When `cursor` is present, `chat()` replays the persisted events after that
cursor instead of re-running the adapter, so a reconnecting client catches up
without duplicating work or burning tokens.

The durable replay state is `{ threadId, runId, cursor }`. Persist all three if
you want to resume after a full page reload.

## Client: automatic resume

The headless client tracks the last cursor it saw and can resume an interrupted
run. In React:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const chat = useChat({
    threadId: 'thread-123',
    connection: fetchServerSentEvents('/api/chat'),
    // Auto-resume is on by default; opt out with `autoResume: false`.
  })

  // Auto-resume continues interrupted runs on mount / when the tab comes
  // back online. To continue on demand, call `chat.resume()`.

  return <>{/* ...render chat.messages... */}</>
}
```

`chat.resumeState` contains `{ threadId, runId, cursor }` for the
active/interrupted run (or `null`). `chat.resume()` continues it on demand.

If a run finishes with `RUN_FINISHED.outcome.type === 'interrupt'`, the client
surfaces pending interrupts. Resume them with AG-UI `RunAgentInput.resume[]`
entries; while a thread has pending user-actionable interrupts, normal new input
on that same thread is rejected by default so the server cannot accidentally
fork the conversation around an unresolved decision.

## Stores and feature validation

`AIPersistence` is a collection of optional stores. `withPersistence` can
validate features up front so missing storage fails loudly instead of silently
dropping durability:

| Feature | Required stores |
| --- | --- |
| `messages` | `stores.messages` |
| `durable-replay` | `stores.runs`, `stores.publicEvents` |
| `interrupts` | `stores.runs`, `stores.publicEvents`, `stores.interrupts` |
| `internal-events` | `stores.internalEvents` |
| `metadata` | `stores.metadata` |
| `locks` | `stores.locks` |
| `artifacts` | `stores.artifacts` |

Public stream events and internal CAS/checkpoint events are separate stores.
`PublicEventStore` is the user-visible replay stream: persisted AG-UI
`StreamChunk` values with cursors. `InternalEventStore` is for implementation
checkpoints, compare-and-swap style coordination, and package-owned internals
that must not leak into public replay.

## Bring your own database

`sqlitePersistence` / `postgresPersistence` accept a connection (`{ path }` /
`{ connectionString }`) **or** an existing handle. Drizzle and Prisma users pass
their client directly:

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import type { DrizzleDb } from '@tanstack/ai-persistence-drizzle'
import type { PrismaRawClient } from '@tanstack/ai-persistence-prisma'

declare const db: DrizzleDb
declare const prisma: PrismaRawClient

const a = drizzlePersistence({ db, dialect: 'postgres' })
const b = prismaPersistence({ prisma, dialect: 'postgres' })
```

Raw drivers create and migrate their tables automatically (opt out with
`{ migrate: false }` and apply the exported `ddl(...)` / `migrate(...)`
yourself). Drizzle and Prisma own their own schema/migrations.

The base SQL schema is deliberately small:

- `runs`
- `public_events`
- `internal_events`
- `messages`
- `interrupts`
- `metadata`
- `_tanstack_ai_migrations`

## MCP and workflow persistence

MCP persistence is app-owned metadata plus raw stream replay. The base
persistence layer records the public AG-UI events and offers `MetadataStore` for
your app or adapter to associate MCP server/session state with a thread or run;
it does not add MCP-specific tables.

Long-running workflow extensions are intentionally deferred to optional
packages. They should reuse runs, public events, internal events, interrupts,
metadata, locks, and artifacts without increasing the base schema cost for apps
that only need resumable chat.

## Sandboxes

For sandbox-backed harness runs, `@tanstack/ai-sandbox-persistence` provides a
durable, SQL-backed sandbox store and a distributed lock so sandbox resume and
ensure-locking survive across processes:

```ts
import { withSandbox, defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence, createSqliteDriver } from '@tanstack/ai-persistence-sqlite'
import { chat } from '@tanstack/ai'
import {
  withPersistenceBridge,
  createSqlSandboxStore,
} from '@tanstack/ai-sandbox-persistence'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import type { ModelMessage } from '@tanstack/ai'

const dbPath = '.tanstack-ai/state.sqlite'
const driver = createSqliteDriver({ path: dbPath })
const persistence = sqlitePersistence({ path: dbPath })
const threadId = 'thread-123'
const runId = 'run-123'
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Resume this repository task.' },
]

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
})

chat({
  threadId,
  runId,
  adapter: claudeCodeText('claude-sonnet-4-6'),
  messages,
  middleware: [
    withPersistence(persistence),
    withPersistenceBridge({
      persistence,
      sandboxStore: createSqlSandboxStore(driver),
    }),
    withSandbox(repoSandbox),
  ],
})
```

A harness adapter (which runs the agent inside the still-running sandbox) can
re-attach to its process on resume and continue live after replaying the event
tail.
