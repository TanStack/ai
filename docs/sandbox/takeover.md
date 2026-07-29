---
title: Takeover & Detached Runs
id: sandbox-takeover
order: 13
description: "Let a sandboxed agent run outlive the browser tab: detach on disconnect, then take the run over from another host and resume streaming where the log left off."
keywords:
  - detached run
  - run takeover
  - sandboxRunDriver
  - detachOnDisconnect
  - detachedRunTtl
  - requestRunCancel
  - JournalReplayDivergedError
  - driverEpoch
---

# Takeover & Detached Runs

A sandboxed coding agent can work for ten minutes. A browser tab does not last
ten minutes. Users refresh, close the laptop, lose wifi, and hit a load balancer
that lands the next request on a different replica.

Without durability wired, the disconnect is fatal: `withSandbox`'s abort path
destroys the sandbox on every abort, deliberately, because closing the agent's
IO stream does **not** kill the agent process (a Docker `exec` survives its
client), so destroying the container is the only reliable way to stop it burning
tokens. Correct for a cancel. Ruinous for a refresh.

Durable runs split those two cases apart. A disconnect **detaches**: the agent
keeps working, the sandbox stays up, and the run record remembers that nobody is
watching. A later request **takes the run over**, replays what was already
delivered, and continues streaming the rest.

This page is the wiring. It builds on two pages you should read first:
[The Run Journal](./journal) (where the agent's output lives, and why it is a
file rather than a pipe) and
[Resumable Streams](../resumable-streams/overview) (the delivery log a client
reconnects to).

## Durability is one opt-in, not two

`withSandbox` takes `runs` and `durability`. A run is durable only when **both**
are present, because either alone is useless: a record with no event log cannot
be replayed, and a log with no record cannot be found, claimed, or reaped. There
is no half-configured state — pass one and you get exactly today's behavior,
silently, with no warning, because you have not asked for durability.

Pass the **same** `RunStore` chat persistence uses, so one record describes the
run instead of two that disagree.

## Server: start a durable run

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
// Your distributed LockStore. `InMemoryLockStore` is NOT enough here — see
// "Requirements" below.
import { locks } from './locks'
// Your `defineSandbox(...)` result.
import { sandbox } from './sandbox'

// Development stand-in. A durable run needs a store every replica can read;
// see ../persistence/build-your-own-adapter.
const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // ONE adapter instance, handed to both the middleware and the transport, so
  // the journal path and the delivery log describe the same run.
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    // Required for a durable run. Omit it and `chatStream` throws
    // `DurableRunIdRequiredError` — see "Requirements".
    runId,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs,
        durability: { adapter, detachedRunTtl: '30m' },
      }),
    ],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

Three things changed compared with a plain sandboxed chat endpoint, and each one
is load bearing:

- **`runs` + `durability`** turn on detach-on-disconnect and publish
  `DetachableRunCapability` on the bus, which is how `withPersistence` learns
  that an abort on this run is a detach rather than a cancel.
- **`runId` is forwarded**, not generated. The journal path and the
  deterministic message-id generator are both derived from it, so a successor
  host can only resume a run whose `runId` it can recompute.
- **The adapter instance is shared** between `withSandbox` and the response.

## Server: take the run over

The takeover happens in the `GET` handler that already serves resumes. Add a
`driver` and the same request that replays the log also claims the run and keeps
driving it.

```ts
import { chat, memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { sandboxRunDriver, withSandbox } from '@tanstack/ai-sandbox'
import { locks } from './locks'
import { sandbox } from './sandbox'
import type { StreamChunk } from '@tanstack/ai'

const persistence = memoryPersistence()
const { messages: messageStore, runs } = persistence.stores

/**
 * The claim hands `drive` an `AbortSignal` that fires the moment this host loses
 * ownership; `chat()` takes an `AbortController`. Mirror one onto the other so a
 * lost claim actually stops the drive.
 */
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
    // The client sent no history — it is reconnecting, not asking a question.
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
          // `attach: true` is the whole difference: the harness tails the run's
          // EXISTING journal instead of starting a second agent. It belongs
          // here and never on `chat()` — core has no sandbox vocabulary — and it
          // is set only by an attach route, never by a POST handler.
          durability: { adapter: memoryStream(request), attach: true },
        }),
      ],
    })
    for await (const chunk of stream) yield chunk
  }

  return resumeServerSentEventsResponse({
    adapter: memoryStream(request),
    driver: sandboxRunDriver({
      request,
      runs,
      locks,
      // Per-run log factory. `memoryStream` keys its log by the run the request
      // names, so every call for one run shares one log; swap in
      // `durableStream(request, options)` for production. Whatever you use MUST
      // return the same instance per `runId` within a process, or `snapshot()`
      // will not see this host's own appends.
      durability: () => memoryStream(request),
      drive: driveRun,
    }),
  })
}
```

The response is **byte-identical** whether or not you pass `driver`: it still
replays from the durability log. The drive runs beside it, appending to the run's
producer-side log, and the response tails what lands. That separation is what
lets a taken-over run keep `chat()`'s normal middleware path, so
`withPersistence`'s `onFinish` still saves the transcript of a run that finished
while detached.

Everything about the takeover is **total by construction** — every failure is
logged and swallowed, and the response still serves the log:

| Situation | What happens |
| --- | --- |
| No run id on the request, or no record | Serve the log, drive nothing. |
| The record is already terminal | Serve the log, drive nothing. A second tab attaching to a finished run must still see the transcript. |
| Another host holds the claim | Serve the log, drive nothing. Two tabs attaching at once: one wins the lease and drives, the other tails. |
| The drive throws | Logged server-side. It cannot be reported to a response that is already streaming; the run's own `RUN_ERROR` event is that channel. |

Serverless platforms need a keep-alive for the background drive — pass
`waitUntil: (promise) => ctx.waitUntil(promise)`.

## Client: reconnect and continue

A mid-stream drop needs nothing: `useChat` reconnects with the last offset and
the server replays from the log.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button onClick={() => void chat.sendMessage('Refactor the auth module')}>
      Send ({chat.messages.length} messages)
    </button>
  )
}
```

A full reload is different. The page comes back with no `Last-Event-ID`, so it
has to ask which run is still going and then join it from the start with
`joinRun` — a read-only `GET` with `offset=-1`, which is exactly the handler
above. That `GET` is what claims the run, so joining and taking over are the same
request.

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

The "which run" endpoint is `RunStore.findActiveRun`, which resolves a live run
from the **stable** `threadId` rather than the ephemeral run id a single turn may
mint several of. It is an optional store method — feature-detect it.

```ts
import { memoryPersistence } from '@tanstack/ai-persistence'

const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get('threadId')
  if (threadId === null) {
    return new Response('threadId is required', { status: 400 })
  }
  // Optional on the RunStore contract, so a backend that omits it degrades to
  // "no active run" instead of throwing.
  const active = await runs.findActiveRun?.(threadId)
  return Response.json({ runId: active?.runId ?? null })
}
```

All four HTTP connection adapters (`fetchServerSentEvents`, `fetchHttpStream`,
`xhrServerSentEvents`, `xhrHttpStream`) expose `joinRun`. For NDJSON, pair it
with `resumeHttpResponse` on the server; the driver wiring is identical.

## Detach vs cancel

**This is the part that is easy to get wrong, and getting it wrong is
expensive.** A user pressing Stop and a user closing the tab produce the
*identical* connection close. There is nothing in the disconnect to tell them
apart.

So intent is never inferred from the disconnect. It arrives **out of band**, and
there are exactly two bands — either of which is authoritative:

1. **Durable** — `requestRunCancel(runs, runId)` records `cancelRequested` on
   the run record. This is the only channel that reaches a run being driven by a
   *different* host than the one the cancel request landed on, which is the
   normal case for a detached run.
2. **In-process** — abort the run's own `AbortController` with
   `RUN_CANCEL_REASON`. Core reads that reason back when it builds `AbortInfo`,
   so `AbortInfo.cancelRequested` is `true` for that abort and `false` for a
   plain disconnect. Fast path when the cancel reaches the driving host.

A cancel endpoint should do **both**. `requestRunCancel` deliberately writes no
status: recording intent is not the same as the run having stopped, and only the
driver knows when the agent is actually dead and the sandbox is gone.

```ts
import { RUN_CANCEL_REASON, requestRunCancel } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'

const persistence = memoryPersistence()
const { runs } = persistence.stores

/**
 * Runs this process is currently driving. Only ever a fast path: a run driven by
 * another replica is absent here, and the durable band is what reaches it.
 */
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

  const active = await runs.findActiveRun?.(threadId)
  if (!active) return new Response(null, { status: 204 })

  // Band 1: durable, so a remote driver observes it on its next teardown.
  await requestRunCancel(runs, active.runId)
  // Band 2: in-process, so a co-located driver stops immediately.
  driving.get(active.runId)?.abort(RUN_CANCEL_REASON)

  return new Response(null, { status: 204 })
}
```

Populate `driving` where you create the run's `AbortController` — in the `POST`
handler for a fresh run, and in `controllerFor` on the takeover path.

On the client, `chat.stop()` alone is **not** a cancel. It aborts a local
`AbortController` and sends the server nothing, which on a durable run is
indistinguishable from a refresh — so the agent keeps running. Call the endpoint
too:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function StoppableChat({ threadId }: { threadId: string }) {
  const chat = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
  })

  async function stopRun(): Promise<void> {
    // Local: stop rendering the stream immediately.
    chat.stop()
    // Remote: tell the server this was intent, not a lost connection.
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

| Event | `withSandbox` | `withPersistence` | Delivery log |
| --- | --- | --- | --- |
| Disconnect, durable, `detachOnDisconnect` on, no cancel recorded | Keeps the sandbox; writes `detachedSince` and `sandboxKey` | Writes **nothing** — the record stays `'running'` | Left **open**, no terminal appended |
| Cancel (either band) | Destroys the sandbox, always, regardless of `destroyOnComplete` | Writes `'aborted'` with `finishedAt` | Terminal `RUN_ERROR`, then closed |
| Disconnect on a non-durable run | Destroys the sandbox | Writes `'aborted'` | Terminal `RUN_ERROR`, then closed |

The delivery-log column is what makes takeover work at all. A detached run's log
has to stay open and terminal-free: a closed log ends the attaching client's
replay at the prefix, and a stored synthetic `RUN_ERROR` is a chunk the takeover's
journal replay cannot reproduce, so alignment diverges and a perfectly healthy run
is recorded as `'failed'`. See [`RunDetachedCapability`](#rundetachedcapability)
for how the verdict reaches the transport.

`keepAlive` / `destroyOnComplete: false` govern *successful completion* only.
They never keep a sandbox alive through a cancel.

Get this backwards in either direction and it hurts: a Stop button that only
calls `chat.stop()` leaks running sandboxes that keep spending tokens with nobody
watching, and treating every disconnect as a cancel kills a user's ten-minute
refactor on a wifi blip.

## Single-writer safety

Only one host may write a run. This is not a nicety — the client has no safety
net below its offset de-dup. If two hosts both snapshot the log, both compute a
"remainder", and both append it, the same logical chunk lands twice under two
different offsets, so it looks new to the client, and the stream processor
applies text and tool-argument deltas unconditionally. You get doubled prose and
`{"a":1}{"a":1}` tool arguments. Takeover is by definition two hosts wanting one
run, so the exclusion has to be real.

`sandboxRunDriver` wires it for you, in three layers:

1. **A lease.** The entire drive runs inside `LockStore.withLock` on a per-run
   key, so the snapshot and every append after it are one critical section. A
   lease-backed lock aborts the drive's signal the moment ownership is lost.
2. **An epoch.** Each successful claim bumps `RunRecord.driverEpoch`. The log
   re-reads it periodically and refuses to append once a higher epoch exists.
   This covers what a lease cannot — a lock whose renewal is coarser than the
   run's append rate, or one whose signal never fires at all.
3. **Quiescence.** The successor waits for the stored log to stop growing before
   its first append, so a predecessor that is still writing is *observed* rather
   than raced. The window defaults to `DEFAULT_FENCE_QUIET_MS` (5 seconds) and is
   configurable with `fenceQuietMs`. If the log never quiesces, the drive fails
   instead of appending into a log another host is still writing.

### Both authoritative channels are fenced

A run's facts live in **two** places: its event log and its record. Fencing only
the log does not remove the harm, it relocates it — a superseded driver whose
append is refused folds that refusal into a terminal `runs.update`, and the
record then reads `'failed'` for a run the successor is healthily streaming.
Every consumer that branches on terminal status (`isTerminalRunStatus`,
`findActiveRun`, a status poller, a reaper) would then believe a live run had
died, on the authority of a host that no longer owns it.

So both seams are closed, over the same claim:

- **The log.** A superseded driver's `append` is refused. The **first** refusal
  latches the fence permanently shut: every later append refuses immediately,
  without a re-read. That permanence matters — the refused append is followed
  directly by the recovery path's own terminal `RUN_ERROR`, and that log belongs
  to the *successor*, so a dead host's error chunk would fail the stream for
  every client attached to the healthy run.
- **The record.** A terminal-status `update` from a lost claim is **suppressed**:
  it resolves without writing. Non-terminal writes still pass through, including
  a stale `detachedSince` or `sandboxKey` — those cannot make a live run look
  finished, and the successor owns and overwrites them anyway.

The practical upshot for you: **a terminal status on the record is trustworthy.**
A status poller may believe it.

`close()` is outside both fences, deliberately. It runs on every teardown path
including the teardown *caused* by losing the claim, and a fenced `close` would
wedge the record at `'running'` with every live tailer parked forever — a
durability `read` only ends when the log closes. A wedged run with parked clients
is worse than the write being prevented.

### Errors you can branch on

```ts
import {
  RunClaimLostError,
  RunClaimNotAcquiredError,
  RunDriverPipeOutsideClaimError,
} from '@tanstack/ai-sandbox'

function describeDriveFailure(error: unknown): string {
  if (error instanceof RunClaimNotAcquiredError) {
    // 'terminal' | 'unknown' | 'superseded' — normal, not a bug.
    return `not driving ${error.runId}: ${error.reason}`
  }
  if (error instanceof RunClaimLostError) {
    return `superseded mid-drive at epoch ${error.heldEpoch}`
  }
  if (error instanceof RunDriverPipeOutsideClaimError) {
    // A programming error: the options object was taken apart and `pipe` called
    // outside `claim`, so there is no epoch to fence with.
    return `run ${error.runId}: pipe ran outside its claim`
  }
  throw error
}
```

The first two are ordinary outcomes of a contended takeover and
`resumeServerSentEventsResponse` already swallows both — you will see them in
logs, not in responses.

### What this is not

It is not airtight fencing. A predecessor paused (GC, VM suspend) for longer than
the quiescence window, between its last fence check and its append landing at the
backend, can still write one batch. Closing that needs a compare-and-set on the
durability write, which `StreamDurability.append` does not offer. The mitigation
is deployment-level: use a lease-backed distributed `LockStore`, and keep
`fenceQuietMs` above the lease's renewal interval.

## Replay and divergence

A takeover does not resume the journal from where the dead host stopped. It
re-reads the journal **from byte zero** and re-translates it, which reproduces
chunks the client already has. Alignment is what makes that safe: the stored log
is read once, the replay is verified against it by fingerprint, the matching
prefix is suppressed, and only the remainder is appended and delivered. The log
*is* the checkpoint, so there is no window in which a checkpoint and the log can
disagree.

Two properties make the comparison possible, and both are already true on the
journaled path:

- **Ids are deterministic.** A journaled run mints message ids from a run-scoped
  counter (`<runId>-0`, `<runId>-1`, …) rather than a timestamp plus randomness.
- **Alignment runs only on an attach.** On a fresh run the transform's premise
  ("this stream is a replay of what is already stored") is false, and aligning
  anyway would match a fresh run's own chunks against pre-existing log entries
  and silently *suppress* them. That is data loss, not a slow path.

### `JournalReplayDivergedError`

If the replay produces a different chunk than the log already holds at that
index, `JournalReplayDivergedError` is thrown with the index and both
fingerprints.

```ts
import { JournalReplayDivergedError } from '@tanstack/ai-sandbox'

function report(error: unknown): string {
  if (error instanceof JournalReplayDivergedError) {
    return `diverged at ${error.index}: stored ${error.stored}, replayed ${error.replayed}`
  }
  throw error
}
```

Read it plainly: **the agent's replay produced a different sequence of events
than the log already delivered.** Translation stopped being deterministic. The
realistic causes are an id generator that is not run-scoped, a translator that
consults the clock, or a journal that was rewritten (most often a reused
`runId`).

What to do about it: treat it as a bug to fix, not a condition to recover from.
Do not catch it and continue — the log is authoritative and already went to the
client, so forwarding past a mismatch delivers a stream whose prefix and suffix
disagree about message identity, and the client cannot survive that. Log the
index and both fingerprints, let the run fail, and check `runId` uniqueness
first.

One tolerance exists. On adapters that splice host-tool-bridge events into their
output (`@tanstack/ai-codex`, `@tanstack/ai-claude-code`), the log holds `CUSTOM`
chunks fired by *live* tool execution, which a replay runs no tools to reproduce.
Alignment skips those as out-of-band, up to `DEFAULT_MAX_OUT_OF_BAND_SKIP` (64)
consecutive entries. The bound is what keeps this a tolerance rather than a
search: unbounded, a genuine determinism regression would scan forward looking
for any fingerprint that happens to match.

## Configuration

All of these live under `withSandbox(sandbox, { durability: { … } })`.

| Option | Default | What it does |
| --- | --- | --- |
| `adapter` | required | The run's delivery-durable event log. Same instance you hand the transport. |
| `journal` | `/tmp/tanstack-runs` (`DEFAULT_JOURNAL_DIR`) | Journal directory inside the sandbox. |
| `detachedRunTtl` | `'30m'` (`DEFAULT_DETACHED_RUN_TTL`) | Wall-clock cap on a running agent with no viewer attached. |
| `detachOnDisconnect` | `true` whenever durability is wired | Whether a disconnect detaches instead of destroying the sandbox. |
| `attach` | `false` | Read an existing run's journal instead of starting an agent. Set by an attach route's `drive`, never by a `POST` handler. |
| `pollIntervalMs` | adapter default | Journal poll interval for providers that cannot follow a file. |

`detachedRunTtl` accepts `'<n>s'`, `'<n>m'`, or `'<n>h'` with `n > 0`, and is
parsed at `withSandbox` **setup**. Anything malformed throws there rather than
falling back to the default — this value caps how long an unwatched agent may
keep spending tokens, so a typo silently becoming 30 minutes is a billing
incident.

**Nothing reaps expired runs for you yet.** The TTL is recorded and the store
contract exposes the query, but no reaper ships. Build the sweep yourself on the
optional `RunStore.listReclaimable({ now, ttlMs })`, which returns runs that are
`'running'`, have a `detachedSince`, and whose `detachedSince <= now - ttlMs`
(inclusive). Two rules if you do: destroy the sandbox named by `sandboxKey`, and
do **not** clear `detachedSince` — that marker is the evidence your own TTL
accounting selected the run on. (The takeover path clears it, because a viewer is
attached again.)

Set `detachOnDisconnect: false` to keep today's destroy-on-disconnect cost
profile while still getting resumable *delivery* — a reload replays the log, but
the agent does not survive the disconnect. An explicit cancel destroys the
sandbox either way.

### `DetachableRunCapability`

A neutral boolean that core owns. `withSandbox` provides it as `true` only when a
run is genuinely durable; `withPersistence` reads it with `getOptional` to decide
whether an abort is terminal (`'aborted'`) or a detach (write nothing). It lives
in core so the two packages can agree without either importing the other — a
persistence → sandbox import would invert the layering. Read it in your own
middleware if you need the same distinction; absent means "not detachable", which
is every app that has not wired durability.

### `RunDetachedCapability`

Its past-tense counterpart, also owned by core. `DetachableRunCapability` is
published at setup and only says a disconnect *may* be survived;
`RunDetachedCapability` is published on the abort path by `withSandbox`'s detach
branch and says the run **was** detached — the agent is still working and a later
attach can take it over.

Its consumer is the durable delivery sink behind `toServerSentEventsResponse` /
`toHttpResponse`. Without the verdict the sink terminalizes every abort, which
defeats takeover (see the table above). The fact travels on the **stream object
itself**, so there is nothing to wire: passing `chat()`'s stream to the response
helper is already mandatory, and both sides hold the same object.

```ts
// You do not write this — `withSandbox` does, on its detach branch.
provideRunDetached(ctx, true)
```

Only a plain, intentless disconnect of a detachable run publishes it. An explicit
cancel in either band, a disconnect on a non-detachable run,
`detachOnDisconnect: false`, a provider failure, and a normal finish all leave it
unpublished, and the sink appends its terminal and closes the log exactly as it
always has. Core additionally refuses to treat an abort carrying
`RUN_CANCEL_REASON` as a detach, whatever a middleware publishes — a user pressing
Stop always gets a closed, terminal log.

## Requirements

**A real `LockStore`.** `InMemoryLockStore` cannot coordinate across hosts: it
serializes claims within one process, and the signal it hands out is a fresh
`AbortController().signal` that is never aborted, so the lease can never report a
loss. Two replicas can then drive one run and duplicate its log. `withSandbox`
emits a warning when durability is wired over an in-memory lock (including when
no lock is wired at all, since the fallback *is* in-memory). See
[Locks](../advanced/locks).

**A caller-supplied `runId`.** A durable run throws
`DurableRunIdRequiredError` at the start of `chatStream` when none is passed.
That is deliberately loud, because the alternative is invisible: an
adapter-generated id produces a journal path no successor host can recompute, so
the run streams normally, records normally, and is silently unrecoverable — you
would only discover it during an incident.

**The run record's `threadId`, on an attaching run.** An ATTACHING durable run
throws `DurableThreadIdRequiredError` when driven without the run record's
`threadId`. `threadId` rides in **every** emitted chunk, so an attach that
generates a fresh one replays a stream whose very first chunk already differs
from the stored log — alignment fails at index 0 with
`JournalReplayThreadIdMismatchError`, a subclass of
[`JournalReplayDivergedError`](#journalreplaydivergederror) reported above,
even though the agent behaved identically. This is the asymmetry to keep
straight: a durable **fresh** run needs no caller `threadId` — that run is
what establishes it — but a durable run that is **attaching** must reuse the
one already on the record, which is exactly the `threadId: input.threadId`
forwarded by `driveRun` above.

**A `RunStore` that persists every durable-run field.** `createOrResume`,
`update`, and `get` are required; `update` must accept and round-trip all of
`status`, `finishedAt`, `error`, `usage`, `sandboxKey`, `detachedSince`,
`cancelRequested`, and `driverEpoch`. The last four are exactly what a
hand-written backend tends to omit — and each omission breaks a specific
mechanism: no `driverEpoch` means no fencing, no `cancelRequested` means Stop
cannot reach a remote driver, no `detachedSince`/`sandboxKey` means nothing can
reclaim the sandbox. Two invariants also hold: `createOrResume` returns an
existing record **unchanged** (that is what makes resuming safe), and `update` on
an unknown `runId` is a **no-op** that must not throw.

`findActiveRun` and `listReclaimable` are optional, but you need the first to
rejoin by thread and the second to build a reaper. Consumers feature-detect both.

## Adapter authors

If you are writing a harness adapter rather than an application, three exports
are yours: `getSandboxDurability` reads the resolved durability off the
capability bus, `journalOptionsFor` turns it into the journal option
`spawnNdjson` takes, and `alignedIfAttaching` applies alignment on attach only.
Wrap the *merged* output stream, never the pre-merge translator, or you compare
against a stream the log never contained. See [Harnesses](./harnesses).

## See also

- [The Run Journal](./journal): where the agent's output lives, `runId`
  uniqueness, and `alignToStoredLog`
- [Sandbox Instance Durability](./durability): keeping the sandbox itself
  findable across processes
- [Lifecycle & Snapshots](./lifecycle): `destroyOnComplete`, `keepAlive`, and
  snapshots
- [Resumable Streams](../resumable-streams/overview) and
  [Advanced](../resumable-streams/advanced): the delivery log, `joinRun`, and
  offset ownership
- [Locks](../advanced/locks): the distributed lock a durable run requires
- [Persistence overview](../persistence/overview) and
  [Build your own adapter](../persistence/build-your-own-adapter): the shared
  `RunStore`
