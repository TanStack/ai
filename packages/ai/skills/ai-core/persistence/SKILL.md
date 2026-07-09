---
name: ai-core/persistence
description: >
  Durable STATE for chat() via withChatPersistence middleware and AIPersistence;
  media generation via withGenerationPersistence. Persists thread messages, run
  records, interrupts, metadata, locks, and artifacts/blobs through optional
  feature-validated stores. Interrupts resume with RunAgentInput.resume[].
  Delivery durability (replaying a disconnected/reloaded stream) is a separate
  TRANSPORT concern, not part of this middleware. Backends: memoryPersistence,
  drizzlePersistence/sqlPersistence, prismaPersistence.
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
  passing `durability` to `toServerSentEventsResponse(stream, { durability })`
  (or `toHttpResponse`): `memoryStream(request)` (process-local, dev/test) or
  `durableStream(request, { server })` from `@tanstack/ai-durable-stream`
  (durable-streams protocol, production). Each SSE event is tagged
  `id: <runId@seq>`; native `EventSource` resumes via `Last-Event-ID` with zero
  client cursor code, and `fetchServerSentEvents(...).joinRun(runId)` attaches a
  second tab from the start (`?offset=-1`). Ceiling: replays what was PRODUCED,
  not an interrupted completion — keep the producer alive past the socket
  (`waitUntil`/durable object/queue). See `docs/persistence/delivery-durability.md`.
- The primary interface is `AIPersistence`; use `defineAIPersistence(...)` for
  custom stores. `ChatPersistence` / `defineChatPersistence` are deprecated
  compatibility aliases only.
- Use **`withChatPersistence(persistence, { features? })`** for `chat()`:
  `setup` (provide capabilities), `onConfig` (load+merge thread messages,
  server-authoritative; validate + apply pending interrupt resumes),
  `onChunk` (interrupt boundary side-effects only — create interrupt records,
  mark the run interrupted, snapshot messages), and `onFinish`/`onError`/`onAbort`
  (run status + usage + transcript save).
- Use **`withGenerationPersistence(persistence, { features? })`** for media
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
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
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

```ts
await chat.resumeInterrupts([
  {
    interruptId: 'interrupt-1',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

`chat.getResumeState()` returns `{ threadId, runId }` for the interrupted run so
the interrupt resume can be reissued across a full page reload (persist it via
`persistence: { server }`).

## Stores and features

`AIPersistence` stores are optional, but feature validation is fail-loud:

| Feature      | Required stores          |
| ------------ | ------------------------ |
| `messages`   | `messages`               |
| `interrupts` | `runs`, `interrupts`     |
| `metadata`   | `metadata`               |
| `locks`      | `locks`                  |
| `artifacts`  | `artifacts`              |
| `blobs`      | `blobs` (pair with `artifacts`) |

## Backends

```ts
import { memoryPersistence } from '@tanstack/ai-persistence' // tests/prototypes
import {
  sqlPersistence, // batteries: builds the db + runs bundled migrations
  drizzlePersistence, // BYO drizzle db
} from '@tanstack/ai-persistence-drizzle'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma' // BYO PrismaClient
```

Each ORM owns its own migrations (drizzle-kit / prisma migrate). The state
tables are `messages`, `runs`, `interrupts`, `metadata`, `artifacts`, `blobs`.

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
