---
title: Takeover & Detached Runs (Advanced)
id: sandbox-takeover
order: 13
description: "Detach on disconnect, take a run over from another host, resume streaming from the log."
keywords:
  - detached run
  - run takeover
  - sandboxRunDriver
  - detachOnDisconnect
  - detachedRunTtlMs
  - requestRunCancel
  - JournalReplayDivergedError
  - driverEpoch
---

# Takeover & Detached Runs

If the agent outlives a tab (refresh, wifi, other replica) → wire durable detach + takeover.

**Must read first:** [Journal](./journal) · [Resumable Streams](../resumable-streams/overview).

Without durability: abort destroys the sandbox (closing the agent IO stream does **not** kill the process). Correct for cancel; ruinous for refresh.

## Opt-in: both `runs` + `durability`

Either alone is useless. Silent destroy-on-disconnect if incomplete. Use the same `RunStore` as chat persistence.

## Same backend stream on POST and GET

`durableStream(request, options)` resolves run via `X-Run-Id` header first, then `?runId`.

- POST from `@tanstack/ai-client` → header
- GET join → `?offset=-1&runId=<runId>`

No run id → throws. Cron/alarm synthesizes a request → [Reaping](./reaping).

```ts
import { durableStream } from '@tanstack/ai-durable-stream'

export const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'agent-runs',
}
```

## Server: start a durable run

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { durableStream } from '@tanstack/ai-durable-stream'
import { durableOptions } from './durability'
import { locks } from './locks'
import { sandbox } from './sandbox'

const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = durableStream(request, durableOptions)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    runId,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
        durability: { adapter },
      }),
    ],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

**Load-bearing:**

1. `runs` + `durability` → detach-on-disconnect + `DetachableRunCapability`.
2. Forward `runId` (journal path, message ids, stream name).
3. Share the same adapter instance with the response.

### Do not mirror `request.signal` into `abortController`

**Cause:** durable POST aborts on disconnect before harness starts.  
**Effect:** empty log; agent never launched; takeover cannot recover.  
**Fix:** omit that mirror. Durable transport notifies disconnect without aborting the run.

### `memoryStream` first-chunk deadline

Sandbox build can exceed default 100ms. Raise on every handle for the run:

```ts
import { memoryStream } from '@tanstack/ai'

const FIRST_CHUNK_DEADLINE_MS = 15 * 60_000

export function adapterFor(request: Request) {
  return memoryStream(request, {
    firstChunkDeadlineMs: FIRST_CHUNK_DEADLINE_MS,
  })
}
```

`durableStream` has no first-chunk deadline. Fresh durable producers also emit `run.accepted` early so clients do not abandon after 2s.

## Server: take the run over

GET that already serves resumes: add `driver` + `attach: true` (never on POST).

```ts
import { chat, resumeServerSentEventsResponse } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { durableStream } from '@tanstack/ai-durable-stream'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { sandboxRunDriver, withSandbox } from '@tanstack/ai-sandbox'
import { durableOptions } from './durability'
import { locks } from './locks'
import { sandbox } from './sandbox'
import type { StreamChunk } from '@tanstack/ai'

const persistence = memoryPersistence()
const { messages: messageStore, runs } = persistence.stores

function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  const abort = (): void => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return controller
}

export function GET(request: Request) {
  async function* driveRun(input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }): AsyncIterable<StreamChunk> {
    const stored = await messageStore.loadThread(input.threadId)
    const stream = chat({
      adapter: claudeCodeText('claude-opus-4-8'),
      messages: stored,
      threadId: input.threadId,
      runId: input.runId,
      abortController: controllerFor(input.signal),
      middleware: [
        withPersistence(persistence),
        withLocks(locks),
        withSandbox(sandbox, {
          runs,
          durability: {
            adapter: durableStream(request, durableOptions),
            attach: true,
          },
        }),
      ],
    })
    for await (const chunk of stream) yield chunk
  }

  return resumeServerSentEventsResponse({
    adapter: durableStream(request, durableOptions),
    driver: sandboxRunDriver({
      request,
      runs,
      locks,
      durability: () => durableStream(request, durableOptions),
      drive: driveRun,
    }),
  })
}
```

Response always replays the log; drive appends beside it. Failures: serve log, drive nothing (no id, terminal, claim lost). Drive throws → log only. Serverless: pass `waitUntil`.

## Client: reconnect

Mid-stream: `useChat` reconnects with last offset.

Full reload: resolve active run → `joinRun`:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useEffect, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'

export function ResumeInFlight({ threadId }: { threadId: string }) {
  const [chunks, setChunks] = useState<Array<StreamChunk>>([])

  useEffect(() => {
    const controller = new AbortController()
    const connection = fetchServerSentEvents('/api/chat')

    async function rejoin(): Promise<void> {
      const response = await fetch(
        `/api/chat/active?threadId=${encodeURIComponent(threadId)}`,
        { signal: controller.signal },
      )
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null || !('runId' in body)) return
      const runId = body.runId
      if (typeof runId !== 'string') return
      for await (const chunk of connection.joinRun(runId, controller.signal)) {
        setChunks((previous) => [...previous, chunk])
      }
    }

    void rejoin().catch(() => {})
    return () => controller.abort()
  }, [threadId])

  return <p>{chunks.length} events replayed</p>
}
```

Active-run endpoint (`findActiveRun`):

```ts
import { memoryPersistence } from '@tanstack/ai-persistence'

const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get('threadId')
  if (threadId === null) {
    return new Response('threadId is required', { status: 400 })
  }
  const active = await runs.findActiveRun(threadId)
  return Response.json({ runId: active?.runId ?? null })
}
```

## Detach vs cancel

Stop and close-tab look identical on the wire. Intent is **out of band**:

1. **Durable:** `requestRunCancel(runs, runId)` — reaches remote drivers.
2. **In-process:** abort with `RUN_CANCEL_REASON`.

Cancel endpoint should do **both**:

```ts
import { RUN_CANCEL_REASON, requestRunCancel } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'

const persistence = memoryPersistence()
const { runs } = persistence.stores
const driving = new Map<string, AbortController>()

export async function POST(request: Request) {
  const body: unknown = await request.json()
  if (typeof body !== 'object' || body === null || !('threadId' in body)) {
    return new Response('threadId is required', { status: 400 })
  }
  const threadId = body.threadId
  if (typeof threadId !== 'string') {
    return new Response('threadId must be a string', { status: 400 })
  }

  const active = await runs.findActiveRun(threadId)
  if (!active) return new Response(null, { status: 204 })

  await requestRunCancel(runs, active.runId)
  driving.get(active.runId)?.abort(RUN_CANCEL_REASON)

  return new Response(null, { status: 204 })
}
```

Client: `chat.stop()` alone is **not** cancel on durable runs — also hit the endpoint:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function StoppableChat({ threadId }: { threadId: string }) {
  const chat = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
  })

  async function stopRun(): Promise<void> {
    chat.stop()
    await fetch('/api/chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId }),
    })
  }

  return <button onClick={() => void stopRun()}>Stop</button>
}
```

### What each path writes

| Event | Sandbox | Record | Delivery log |
| --- | --- | --- | --- |
| Disconnect, durable, no cancel | Keep; `detachedSince` + `sandboxKey` | Stay `'running'` | Open, no terminal |
| Cancel | Always destroy | `'aborted'` | Terminal then close |
| Disconnect, non-durable | Destroy | `'aborted'` | Terminal then close |

`keepAlive` / `destroyOnComplete: false` never survive cancel.

### Cancel on non-killable providers

`killableProcesses: false` (Daytona, Vercel, Cloudflare, …) → **destroy is the cancel**. Mark aborted without destroy → UI stopped, agent still billing. → [providers table](./providers#killableprocesses-across-the-bundled-providers).

## Single-writer safety

Two hosts appending → doubled prose / tool args. `sandboxRunDriver` fences:

1. **Lease** — `LockStore.withLock` on per-run key.
2. **Epoch** — `driverEpoch` bumps; superseded appends refused.
3. **Quiescence** — wait for log to stop growing (`fenceQuietMs`, default 5s).

Both log **and** record are fenced (terminal `update` from lost claim suppressed). `close()` is intentionally unfenced (wedged open log is worse).

Errors: `RunClaimNotAcquiredError`, `RunClaimLostError` (normal contention — swallowed by resume helper); `RunDriverPipeOutsideClaimError` (programming error).

Not airtight if a predecessor pauses longer than quiescence — use a real distributed lease; keep `fenceQuietMs` above renewal interval.

## Replay and divergence

Takeover re-reads journal from byte 0; alignment suppresses the stored prefix. Attach only — never align a fresh run (would suppress new chunks).

`JournalReplayDivergedError` → bug (ids, clock, reused `runId`). Do not continue past mismatch.

Out-of-band host-tool events skipped up to `DEFAULT_MAX_OUT_OF_BAND_SKIP` (64).

## Config (`durability: { … }`)

| Option | Default | Role |
| --- | --- | --- |
| `adapter` | required | Delivery log (same as transport) |
| `journal` | `/tmp/tanstack-runs` | Journal dir in sandbox |
| `detachOnDisconnect` | `true` when durability wired | Disconnect detaches vs destroy |
| `attach` | `false` | Tail existing journal (GET drive only) |
| `pollIntervalMs` | adapter default | For non-follow providers |

**No `detachedRunTtl` here** — only `reapDetachedRuns({ detachedRunTtlMs })`. **You must schedule the reaper** → [Reaping](./reaping).

`detachOnDisconnect: false` → destroy-on-disconnect but still resumable delivery log.

### Capabilities (core)

- `DetachableRunCapability` — setup: disconnect *may* be a detach.
- `RunDetachedCapability` — abort path: run **was** detached; sink leaves log open.

## Requirements

| Must | Why |
| --- | --- |
| Distributed `LockStore` | In-memory cannot fence replicas |
| Caller `runId` | Else `DurableRunIdRequiredError` / unrecoverable journal |
| Attach: record's `threadId` | Else `JournalReplayThreadIdMismatchError` at index 0 |
| `RunStore` fields | `sandboxKey`, `detachedSince`, `cancelRequested`, `driverEpoch`, … |
| `findActiveRun` | Rejoin by thread |
| `listReclaimable` (optional) | Required for reaper to have work |

## Adapter authors

`getSandboxDurability` · `journalOptionsFor` · `alignedIfAttaching` (wrap **merged** stream). → [Harnesses](./harnesses).

## See also

[Durable Runs](./durable-runs) · [Journal](./journal) · [Instance Durability](./durability) · [Lifecycle](./lifecycle) · [Resumable Streams](../resumable-streams/overview) · [Locks](../advanced/locks) · [Persistence](../persistence/overview)
