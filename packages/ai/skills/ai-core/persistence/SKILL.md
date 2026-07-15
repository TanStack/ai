---
name: ai-core/persistence
description: >
  Durable STATE for chat() via withChatPersistence middleware and AIPersistence;
  media generation via withGenerationPersistence. Persists thread messages, run
  records, interrupts, metadata, locks, and artifacts/blobs through optional
  composable stores. Interrupts resume with RunAgentInput.resume[].
  Delivery durability (replaying a disconnected/reloaded stream) is a separate
  TRANSPORT concern, not part of this middleware. Backends: memoryPersistence,
  drizzlePersistence/sqlitePersistence, prismaPersistence.
type: sub-skill
library: tanstack-ai
library_version: '0.30.0'
sources:
  - 'TanStack/ai:docs/persistence/overview.md'
---

# Persistence (state durability)

> **Dependency note:** This skill builds on ai-core and ai-core/middleware. Read those first.

## Core rules

- Persistence middleware persists **state only**: thread messages, run records,
  interrupts, metadata, locks, and generation artifacts/blobs. It never mutates
  the chunk stream and stamps **no** cursor. A `chat()` with no persistence
  middleware produces byte-identical chunks.
- **Delivery durability** (a client disconnects/reloads and still receives the
  full ordered stream) is a **transport-layer** concern, handled by a pluggable
  `StreamDurability` sink on the transport helpers — NOT by this middleware.
  There is no in-band `cursor` and no `chat({ cursor })` replay. Wire it by
  passing `durability` to
  `toServerSentEventsResponse(stream, { durability: { adapter } })`
  (or `toHttpResponse`): `memoryStream(request)` (process-local, dev/test) or
  `durableStream(request, { server })` from `@tanstack/ai-durable-stream`
  (durable-streams protocol, production). Each SSE event is tagged with an
  opaque adapter-owned offset; native `EventSource` resumes via `Last-Event-ID`
  with zero application cursor code. Ceiling: replays what was PRODUCED, not an
  interrupted completion — keep the producer alive past the socket
  (`waitUntil`/durable object/queue). See `docs/persistence/delivery-durability.md`.
- The persistence interface is `AIPersistence`; use
  `defineAIPersistence({ stores })` for custom stores and
  `composePersistence(base, { overrides })` to replace or disable individual
  stores.
- Use **`withChatPersistence(persistence)`** for `chat()`:
  `setup` (provide capabilities), `onConfig` (load+merge thread messages,
  server-authoritative; validate + apply pending interrupt resumes),
  `onChunk` (interrupt boundary side-effects only — create interrupt records,
  mark the run interrupted, snapshot messages), and `onFinish`/`onError`/`onAbort`
  (run status + usage + transcript save).
- Use **`withGenerationPersistence(persistence)`** for media
  generation (`generateImage`, `generateAudio`, TTS, video, transcription):
  run status updates and optional artifact/blob persistence.
- Pending user-actionable interrupts are represented by
  `RUN_FINISHED.outcome.type === 'interrupt'`, persisted in `InterruptStore`,
  and resumed with AG-UI `RunAgentInput.resume[]`. Normal new input on the same
  thread is blocked by default while pending interrupts exist. Interrupt resume
  is STATE (approvals / client-tool results), not delivery.

## Server — state-persisted endpoint

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:./chat.db',
  migrate: true,
})

export async function POST(request: Request) {
  const { messages, threadId, runId, resume } = await request.json()
  const stream = chat({
    threadId,
    runId,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withChatPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

## Client — resolving interrupts

For pending interrupts, send resume entries matching every pending interrupt
with `resumeInterrupts(...)`:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function ApprovalChat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button
      type="button"
      onClick={() => {
        void chat.resumeInterrupts([
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ])
      }}
    >
      Approve
    </button>
  )
}
```

`chat.getResumeState()` returns `{ threadId, runId }` for the interrupted run so
the interrupt resume can be reissued across a full page reload (persist it via
`persistence: { server }`).

## Stores and composition

`AIPersistence` stores are optional, but dependent store pairs are validated
fail-loud:

| Capability   | Required stores                 |
| ------------ | ------------------------------- |
| `messages`   | `messages`                      |
| `interrupts` | `runs`, `interrupts`            |
| `metadata`   | `metadata`                      |
| `locks`      | `locks`                         |
| `artifacts`  | `artifacts`                     |
| `blobs`      | `blobs` (pair with `artifacts`) |

## Backends

```ts
import { memoryPersistence } from '@tanstack/ai-persistence' // tests/prototypes
import {
  drizzlePersistence, // BYO migrated SQLite-family Drizzle db, including D1
  sqliteMigrations, // bundled SQL for custom migration workflows
} from '@tanstack/ai-persistence-drizzle'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma' // BYO PrismaClient
```

The Drizzle package exports `sqliteMigrations` and a migration-copy CLI. The
Prisma package exports `prismaModels` and a model-copy CLI so applications can
incorporate the models into their own provider-specific migration workflow.
The state tables are `messages`, `runs`, `interrupts`, `metadata`, `artifacts`,
and `blobs`.

Projects that run their own drizzle-kit journal can own the schema instead of
applying the bundled SQL: emit it with the `tanstack-ai-drizzle-schema` CLI
(`--out <dir>` / `--stdout`), add the emitted file to the drizzle-kit `schema`
paths, and pass it back via `drizzlePersistence(db, { schema })`. The runtime
reads and writes through the injected table objects, so renamed tables/columns
(including drizzle `casing` conventions) and extra app-owned columns (for
example a nullable `userId` on `messages` for thread ownership) are supported;
the `TanstackAiSchema` type pins the required column data shapes and
construction validates tables/columns exist (`DrizzleSchemaError`).

The Prisma models in the fragment are renameable the same way (an app often
already has a `Message` or `Run` model): rename them in your copy and map each
store to the renamed client delegate via
`prismaPersistence(prisma, { models: { messages: 'chatMessage' } })` — values
are camelCase client accessor names. Keep the fragment's field names/types and
the metadata `scope_key` composite alias; DB names are governed by
`@@map`/`@map`, and extra app-owned optional fields are ignored by the stores.
Unresolvable delegates throw `PrismaModelError` at construction.

## Sandboxes

Place `withChatPersistence(...)` before `withSandbox(...)` to make sandbox
resume and ensure-locking durable across processes. `withSandbox(...)` reads
the configured persistence metadata store for sandbox records and uses the
shared `locks` capability from `@tanstack/ai` when `withChatPersistence(...)`
provides it.

## Gotchas

- `ModelMessage` has no id; message reconciliation is whole-transcript and
  server-authoritative (client messages win when present, else stored history).
- The chat middleware never mutates the stream — do not expect a cursor on
  persisted chunks. Delivery replay lives on the transport layer.
- Approval custom events are legacy projection. Primary actionable waits are
  `RUN_FINISHED.outcome.type === 'interrupt'`.
