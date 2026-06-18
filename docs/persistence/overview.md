---
title: Persistence Overview
id: overview
---

Persistence makes a `chat()` run **durable** and **resumable** — without changing
how you write `chat()`. It is composable middleware, so it is entirely optional:
a run with no persistence middleware behaves exactly as before, and the same
middleware works for plain model adapters and for sandbox-backed harness adapters.

`withPersistence(...)`:

- loads and saves the thread's message history (the server is authoritative),
- records each run (status, usage, errors),
- appends every streamed AG-UI event to an append-only **event log**,
- stamps each streamed chunk with an opaque **cursor** so a disconnected client
  can resume,
- and (in agent mode) persists approvals and artifacts.

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
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic/adapters'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

// Build once and reuse across requests.
const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  mode: 'chat',
})

export async function POST(request: Request) {
  // `runId` is reused on a resume; `cursor` is present only when resuming.
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

When `cursor` is present, `chat()` replays the persisted events after that
cursor instead of re-running the adapter — so a reconnecting client catches up
without duplicating work or burning tokens.

## Client: automatic resume

The headless client tracks the last cursor it saw and can resume an interrupted
run. In React:

```tsx
import { useChat } from '@tanstack/ai-react'

function Chat() {
  const chat = useChat({
    threadId: 'thread-123',
    transport: { api: '/api/chat' },
    // Auto-resume is on by default; opt out with `autoResume: false`.
  })

  // Call on mount / when the tab comes back online to continue an
  // interrupted run where it left off:
  // useEffect(() => { chat.maybeAutoResume() }, [])

  return <>{/* ...render chat.messages... */}</>
}
```

`chat.getResumeState()` returns `{ runId, cursor }` for the active/interrupted
run (or `null`), which you can persist to resume across a full page reload;
`chat.resume()` continues it on demand.

## Modes

`mode` declares how much is persisted:

| Mode | Persists |
| --- | --- |
| `'messages'` | thread message history only |
| `'chat'` | messages + runs + event log + usage (resumable conversations) |
| `'agent'` | everything in `chat`, plus sandbox records, approvals, and artifacts |

## Bring your own database

`sqlitePersistence` / `postgresPersistence` accept a connection (`{ path }` /
`{ connectionString }`) **or** an existing handle. Drizzle and Prisma users pass
their client directly:

```ts
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'

const a = drizzlePersistence({ db, dialect: 'postgres', mode: 'chat' })
const b = prismaPersistence({ prisma, dialect: 'postgres', mode: 'chat' })
```

Raw drivers create and migrate their tables automatically (opt out with
`{ migrate: false }` and apply the exported `ddl(...)` / `migrate(...)`
yourself). Drizzle and Prisma own their own schema/migrations.

## Agent mode + sandboxes

For sandbox-backed harness runs, `@tanstack/ai-sandbox-persistence` provides a
durable, SQL-backed sandbox store and a distributed lock so sandbox resume and
ensure-locking survive across processes:

```ts
import { withSandbox, defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence, createSqliteDriver } from '@tanstack/ai-persistence-sqlite'
import {
  withPersistenceBridge,
  createSqlSandboxStore,
} from '@tanstack/ai-sandbox-persistence'
import { claudeCode } from '@tanstack/ai-claude-code'

const dbPath = '.tanstack-ai/state.sqlite'
const driver = createSqliteDriver({ path: dbPath })
const persistence = sqlitePersistence({ path: dbPath, mode: 'agent' })

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
})

chat({
  threadId,
  runId,
  adapter: claudeCode({ model: 'claude-sonnet-4-6' }),
  messages,
  middleware: [
    withPersistence(persistence),
    withPersistenceBridge({
      persistence,
      sandboxStore: createSqlSandboxStore(driver),
    }),
    withSandbox(repoSandbox),
  ],
}).toResponse()
```

A harness adapter (which runs the agent inside the still-running sandbox) can
re-attach to its process on resume and continue live after replaying the event
tail.
