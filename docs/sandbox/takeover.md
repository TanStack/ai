---
title: Takeover & Detached Runs (Advanced)
id: sandbox-takeover
order: 13
description: "Keep a sandboxed agent run alive when the browser tab closes. A disconnect detaches the run, and a later request on any server takes it over and continues the stream."
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

Takeover attaches a new connection to a run that is still in progress. A refresh, a closed laptop, or another replica does not destroy the sandbox.

Takeover keeps the run alive. A disconnect **detaches**: the agent keeps working, and the run record notes that nobody is watching. A later request, on any server, **takes the run over**. It replays what the client already saw, then streams the rest.

Read [Durable Runs](./durable-runs) first if you want the idea without code. This page is the wiring.

## Requirements

Takeover runs across replicas, so every piece must be shared:

- **One `RunStore` and one `SandboxInstanceStore` that every replica reads.** Pass the run store that chat persistence uses. Pass the instance store to `withSandbox` as `instances`, so the reaper can find each sandbox later. The run store must keep every durable-run field: `status`, `finishedAt`, `error`, `usage`, `sandboxKey`, `detachedSince`, `cancelRequested`, and `driverEpoch`. See [Takeover Internals](./takeover-advanced#what-the-runstore-must-keep).
- **A distributed `LockStore`.** `InMemoryLockStore` cannot coordinate across hosts, so two replicas can drive one run and double its output. `withSandbox` warns when it sees one. See [Locks](../advanced/locks).
- **One durability backend that every replica reaches**, for example `durableStream` from `@tanstack/ai-durable-stream`.
- **A `runId` from the request.** A durable run without one throws `DurableRunIdRequiredError`, because no other host can find its journal.
- **A scheduled reaper.** Without it, sandboxes of abandoned runs bill forever. See [Reaping & Retention](./reaping).

## Set up the server

1. Put the shared pieces in one module. Both routes and the reaper import it.

```ts
// run-setup.ts
import { chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { durableStream } from '@tanstack/ai-durable-stream'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  InMemorySandboxInstanceStore,
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import type { StreamChunk } from '@tanstack/ai'

// Local dev stand-ins. In production, use stores every replica reads and a
// distributed LockStore. See Requirements.
export const persistence = memoryPersistence()
export const locks = new InMemoryLockStore()
export const instances = new InMemorySandboxInstanceStore()
export const { runs } = persistence.stores

// The Durable Streams backend every replica reaches.
export const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'agent-runs',
}

export const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [
      'npm install -g @anthropic-ai/claude-code --include=optional && claude --version',
    ],
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
})

// The run's delivery log, from its id alone. Works with no live request,
// so the reaper can use it too.
export function durabilityFor(runId: string) {
  const url = new URL('https://runs.internal/')
  url.searchParams.set('runId', runId)
  return durableStream(new Request(url), durableOptions)
}

// The claim gives `drive` an AbortSignal that fires when this host loses the
// run. chat() takes an AbortController, so mirror one onto the other.
function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  const abort = (): void => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return controller
}

// Continue an existing run. Used by the takeover route and by the reaper.
export async function* driveRun(input: {
  runId: string
  threadId: string
  signal: AbortSignal
}): AsyncIterable<StreamChunk> {
  // The client sent no history: it is reconnecting, not asking a question.
  const messages = await persistence.stores.messages.loadThread(input.threadId)
  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    // Reuse the threadId on the run record. A new one breaks the replay.
    threadId: input.threadId,
    runId: input.runId,
    abortController: controllerFor(input.signal),
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
        instances,
        // attach: true reads the run's existing journal. It does not start a
        // second agent. Only a takeover sets it, never a POST handler.
        durability: { adapter: durabilityFor(input.runId), attach: true },
      }),
    ],
  })
  for await (const chunk of stream) yield chunk
}
```

2. Start durable runs in your `POST` route. Pass `runs` and `durability` together, and forward the `runId`.

```ts
// routes/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { durableStream } from '@tanstack/ai-durable-stream'
import { withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import {
  durableOptions,
  instances,
  locks,
  persistence,
  runs,
  sandbox,
} from './run-setup'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // @tanstack/ai-client sends X-Run-Id on every POST, so this addresses
  // agent-runs/<runId>. Use ONE instance for the middleware and the response.
  const adapter = durableStream(request, durableOptions)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    runId,
    // No abortController that mirrors request.signal here. See below.
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, { runs, instances, durability: { adapter } }),
    ],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

> [!WARNING]
> Do not pass an `abortController` that mirrors `request.signal` on a durable run. If the client leaves while the sandbox builds, the abort stops `chat()` before the agent starts. The run does nothing, and no takeover can recover it, because there is no journal. The durable transport already tells `withSandbox` about the disconnect without an abort.

3. Take the run over in the `GET` handler that serves resumes. Add a `driver`.

```ts
// routes/chat.ts: add this next to POST, and merge the imports.
import { resumeServerSentEventsResponse } from '@tanstack/ai'
import { durableStream } from '@tanstack/ai-durable-stream'
import { sandboxRunDriver } from '@tanstack/ai-sandbox'
import {
  durabilityFor,
  durableOptions,
  driveRun,
  locks,
  runs,
} from './run-setup'

export function GET(request: Request) {
  return resumeServerSentEventsResponse({
    // Replays the log from the offset on this request (?offset=-1 from a
    // join, or Last-Event-ID from a reconnect).
    adapter: durableStream(request, durableOptions),
    // Claims the run and keeps driving it next to the replay.
    driver: sandboxRunDriver({
      request,
      runs,
      locks,
      durability: durabilityFor,
      drive: driveRun,
    }),
  })
}
```

The response is the same with or without `driver`: it replays the log. The driver runs beside it and appends to the same log, and the response tails what lands. Because the drive goes through `chat()`, `withPersistence` still saves the transcript of a run that finished while nobody watched.

On a serverless platform, also pass `waitUntil: (promise) => ctx.waitUntil(promise)` to `sandboxRunDriver`, so the platform keeps the background drive alive.

## Rejoin from the client

A drop in the middle of a stream needs nothing. `useChat` reconnects with the last offset, and the server replays from the log.

A full page reload has no offset. The page must find the live run, then join it from the start. That join is the `GET` above, so joining and taking over are the same request.

1. Add an endpoint that returns the live run for a thread. `findActiveRun` looks it up by the stable `threadId`.

```ts
// routes/chat-active.ts
import { runs } from './run-setup'

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get('threadId')
  if (threadId === null) {
    return new Response('threadId is required', { status: 400 })
  }
  const active = await runs.findActiveRun(threadId)
  return Response.json({ runId: active?.runId ?? null })
}
```

2. On mount, ask for the live run and join it with `joinRun`.

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

    void rejoin().catch(() => {
      // The run finished, or there was none. Nothing to rejoin.
    })
    return () => controller.abort()
  }, [threadId])

  return <p>{chunks.length} events replayed</p>
}
```

Reload the page while the agent works. The events replay, and new ones keep coming.

## Detach vs cancel

A user who presses Stop and a user who closes the tab make the same connection close. The server cannot tell them apart from the disconnect. So a Stop must also send its intent on a separate path. There are two, and either one is enough:

- **Durable:** `requestRunCancel(runs, runId)` sets `cancelRequested` on the run record. This is the only path that reaches a run driven by a different host, which is the normal case for a detached run.
- **In-process:** abort the run's own `AbortController` with `RUN_CANCEL_REASON`. This is the fast path when the cancel lands on the driving host. Core reads the reason back, so `AbortInfo.cancelRequested` is `true` for this abort and `false` for a plain disconnect.

1. Add a cancel endpoint that uses both.

```ts
// routes/chat-cancel.ts
import { RUN_CANCEL_REASON, requestRunCancel } from '@tanstack/ai'
import { runs } from './run-setup'

// Runs this process drives now. Add an entry where you create a run's
// AbortController, and remove it when the run ends.
export const driving = new Map<string, AbortController>()

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

  // Durable: a driver on another host sees it.
  await requestRunCancel(runs, active.runId)
  // In-process: a driver on this host stops at once.
  driving.get(active.runId)?.abort(RUN_CANCEL_REASON)

  return new Response(null, { status: 204 })
}
```

`requestRunCancel` writes no status. Only the driver knows when the agent is dead and the sandbox is gone, so only the driver writes `'aborted'`.

2. Make the Stop button call the endpoint. `chat.stop()` alone sends the server nothing, and a durable run keeps working, because that looks like a refresh.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function StoppableChat({ threadId }: { threadId: string }) {
  const chat = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
  })

  async function stopRun(): Promise<void> {
    // Local: stop rendering the stream now.
    chat.stop()
    // Remote: tell the server that this is a cancel, not a lost connection.
    await fetch('/api/chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId }),
    })
  }

  return <button onClick={() => void stopRun()}>Stop</button>
}
```

Get this wrong in either direction and it costs you:

- A Stop that only calls `chat.stop()` leaks running sandboxes that keep spending tokens.
- A server that treats every disconnect as a cancel kills a ten-minute refactor on a wifi blip.

### What each path writes

| Event | `withSandbox` | `withPersistence` | Delivery log |
| --- | --- | --- | --- |
| Disconnect on a durable run, `detachOnDisconnect` on, no cancel | Keeps the sandbox. Writes `detachedSince` and `sandboxKey`. | Writes nothing. The record stays `'running'`. | Stays open, with no terminal event. |
| Cancel (either path) | Destroys the sandbox, always, even with `destroyOnComplete: false`. | Writes `'aborted'` and `finishedAt`. | Terminal `RUN_ERROR`, then closed. |
| Disconnect on a non-durable run | Destroys the sandbox. | Writes `'aborted'`. | Terminal `RUN_ERROR`, then closed. |

`keepAlive` and `destroyOnComplete: false` apply to a successful finish only. They never keep a sandbox alive through a cancel.

The open log is what makes takeover work. A closed log ends the rejoining client's replay early. A stored `RUN_ERROR` is a chunk the journal replay cannot reproduce, so the replay diverges and a healthy run is marked `'failed'`.

### What cancel means on a provider that cannot kill

Some providers declare `killableProcesses: false`. Daytona, Vercel, and Cloudflare are among the bundled ones (see [the measured table](./providers#killableprocesses-across-the-bundled-providers)). On those, no signal reaches the agent process: `kill()` does not stop it, and no `AbortSignal` crosses the provider boundary.

There, **the sandbox destroy is the cancel**, not cleanup. It is the only thing that stops the agent. If a cancel does anything less (marks the record `'aborted'`, closes the log, skips the destroy), the UI says "stopped" while the agent keeps working and the sandbox keeps billing.

## How it works

1. The `POST` route starts the agent. The agent writes to the [journal](./journal), and the host appends each chunk to the delivery log.
2. The client leaves. `withSandbox` sees a disconnect with no cancel, so it detaches: it keeps the sandbox and stamps `detachedSince` and `sandboxKey` on the run record. The log stays open.
3. A client comes back and calls the `GET` route. `sandboxRunDriver` claims the run under a lock and bumps a fencing number on the record, so the old host cannot write to the run.
4. The new host reads the journal from byte 0. It drops every chunk the log already holds and appends only the rest.
5. If nobody comes back, the [reaper](./reaping) finishes the run or cancels it after a time limit, and then destroys the sandbox.

The fencing, the replay rules, and every error you can branch on are in [Takeover Internals](./takeover-advanced).

## Configuration

These options go in `withSandbox(sandbox, { durability: { ... } })`.

| Option | Default | What it does |
| --- | --- | --- |
| `adapter` | required | The run's delivery log. Use the same instance you give the response. |
| `journal` | `/tmp/tanstack-runs` (`DEFAULT_JOURNAL_DIR`) | Journal directory inside the sandbox. |
| `detachOnDisconnect` | `true` when durability is wired | `true`: a disconnect detaches. `false`: a disconnect destroys the sandbox, but a reload still replays the log. A cancel destroys in both cases. |
| `attach` | `false` | Read an existing run's journal instead of starting an agent. Only a takeover `drive` sets it. |
| `pollIntervalMs` | adapter default | Journal poll interval for providers that cannot follow a file. |
| `attachWaitMs` | `10000` (`DEFAULT_ATTACH_JOURNAL_WAIT_MS`) | How long an attach waits for a live run's journal to appear. An unknown or finished run fails at once. |

There is no TTL option here. The time limit for a detached run is `detachedRunTtlMs` on `reapDetachedRuns`, and it lives only there. The reaper runs from a cron with no chat request, so it can never read a TTL set on `withSandbox`. See [Reaping & Retention](./reaping).

## Go deeper

For single-writer fencing, replay divergence, the run store contract, and the two run capabilities, see [Takeover Internals](./takeover-advanced).
