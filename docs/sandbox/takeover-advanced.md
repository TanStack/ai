---
title: Takeover Internals
id: sandbox-takeover-advanced
description: "How sandbox run takeover stays safe: which stream each route addresses, single-writer fencing, replay divergence, the RunStore contract, and the detach capabilities."
keywords:
  - sandboxRunDriver
  - driverEpoch
  - fenceQuietMs
  - RunClaimLostError
  - JournalReplayDivergedError
  - DetachableRunCapability
  - RunDetachedCapability
---

Use this page when you run [takeover](./takeover) in production, write your own `RunStore`, or debug a run that failed during a takeover.

## Both routes address the same stream

A `StreamDurability` belongs to one run. `durableStream(request, options)` finds that run with core's `resolveResumeRunId`:

1. The `X-Run-Id` header.
2. Else the `?runId` query parameter.

Core's `memoryStream` uses the same resolver, so two durability adapters never disagree about which run a request names.

- A **POST from `@tanstack/ai-client`** sends the run id in the `X-Run-Id` header. The POST URL is the same as for a plain chat request.
- A **GET join** sends it in the URL: `joinRun` requests `?offset=-1&runId=<runId>`.

Both resolve to `agent-runs/<runId>`. A mid-stream SSE reconnect to the POST route also works: it carries `Last-Event-ID` and the same `X-Run-Id` header.

A request with no run id throws, so it never writes to a stream that no attach can name:

```
durableStream: a runId is required: send it as an X-Run-Id header or a
?runId query param
```

This only affects a client that skips `@tanstack/ai-client` (a custom `fetch`, a hand-written reconnect). Make sure that it sends the header or the query parameter.

A caller with no live `Request` (a cron, a Durable Object `alarm()`) makes one, as `durabilityFor` does in the [setup](./takeover#set-up-the-server).

## Why the POST route must not abort on disconnect

A plain sandboxed endpoint mirrors `request.signal` into an `abortController`, because there a disconnect must end the run. On a durable run, that abort destroys what you want to keep:

- An abort makes `chat()` return at its cancel check, right after middleware `setup`.
- So the harness adapter's `chatStream` never runs, and the agent never starts.
- Switch tabs while the UI says "starting the sandbox", and you come back to an empty log.
- No takeover can recover it. An agent that never started wrote no journal.

The disconnect still reaches `withSandbox` without an abort. When the response body is cancelled, the durable transport tells the run, and then:

- `withSandbox` stamps `detachedSince` and `sandboxKey` and publishes the detach verdict.
- The run keeps draining into its open delivery log.
- A rejoining client tails that log.

A real Stop is not affected, because it arrives on its own path. See [Detach vs cancel](./takeover#detach-vs-cancel).

## Rejoin while the sandbox builds

On `memoryStream`, a rejoin during the sandbox build can fail with `Memory stream run produced no data within 100ms`, for a healthy run. `memoryStream` gives up on a from-start rejoin when no chunk arrives within `firstChunkDeadlineMs` (100 ms by default). That fits chat, where a live run's log already has chunks. A sandboxed run emits nothing until `ensure` has built the sandbox and cloned the repo.

Raise the deadline on every handle for the run. The `GET` that serves the rejoin is the call that applies it:

```ts
import { memoryStream } from '@tanstack/ai'

// Longer than your slowest `ensure`.
const FIRST_CHUNK_DEADLINE_MS = 15 * 60_000

// Use it for the POST (the producer) and the GET (the rejoin).
export function adapterFor(request: Request) {
  return memoryStream(request, {
    firstChunkDeadlineMs: FIRST_CHUNK_DEADLINE_MS,
  })
}
```

A long deadline costs nothing when you gate the rejoin on `findActiveRun`, which already filters out runs that are gone.

This deadline is a backstop:

- `durableStream` has no first-chunk deadline. Its `read` waits for a live reader, so an empty live log waits.
- A fresh durable producer appends one `CUSTOM` `run.accepted` chunk (`RUN_ACCEPTED_EVENT`) before it reads the producer stream. A rejoin attaches in milliseconds. The chunk also keeps the client from giving up: `ai-client` drops a rejoin that gets nothing for 2 seconds, and a sandbox build always takes longer.

## What the takeover route does when it cannot drive

The takeover never breaks the response. Every failure is logged and swallowed, and the response still serves the log:

| Situation | What happens |
| --- | --- |
| No run id on the request, or no record | Serve the log. Drive nothing. |
| The record is already finished | Serve the log. Drive nothing. A second tab on a finished run still sees the transcript. |
| Another host holds the claim | Serve the log. Drive nothing. With two tabs, one wins the lease and drives, and the other tails. |
| The drive throws | Logged on the server. The response is already streaming, so the run's own `RUN_ERROR` event reports it. |

All four HTTP connection adapters (`fetchServerSentEvents`, `fetchHttpStream`, `xhrServerSentEvents`, `xhrHttpStream`) have `joinRun`. For NDJSON, use `resumeHttpResponse` on the server. The `driver` wiring is the same.

## Single-writer safety

Only one host can write a run. The client has no safety net below its offset de-dup. If two hosts both read the log, both compute "the rest", and both append it, the same chunk lands twice under two offsets. The client shows doubled prose and `{"a":1}{"a":1}` tool arguments. A takeover is two hosts that want one run, so the lock must be real.

`sandboxRunDriver` gives you three layers:

1. **A lease.** The whole drive runs inside `LockStore.withLock` on a per-run key, so the log read and every later append are one critical section. A lease-backed lock aborts the drive's signal the moment the host loses the lease.
2. **An epoch.** Each claim bumps `RunRecord.driverEpoch`. The log re-reads it from time to time and refuses to append once a higher epoch exists. This covers a lock that renews slower than the run appends, or one whose signal never fires.
3. **Quiet time.** Before its first append, the new host waits for the stored log to stop growing. So it sees an old host that still writes, and does not race it. The wait is `DEFAULT_FENCE_QUIET_MS` (5 seconds). Change it with `fenceQuietMs` on `sandboxRunDriver`. If the log never goes quiet, the drive fails and appends nothing.

### Both channels are fenced

A run's facts live in two places: its event log and its record. If only the log is fenced, a superseded host turns its refused append into a terminal `runs.update`. The record then says `'failed'` for a run the new host streams without problems. Then anything that checks status (`isTerminalRunStatus`, `findActiveRun`, a status poller, the reaper) believes that a live run died.

So both are fenced, on the same claim:

- **The log.** A superseded host's `append` is refused. The first refusal shuts the fence for good: later appends refuse at once, with no re-read. This matters because the recovery path appends its own `RUN_ERROR` right after the refusal, and that log now belongs to the new host. Without the latch, a dead host's error fails the stream for every client.
- **The record.** A terminal-status `update` from a lost claim does nothing and resolves. Non-terminal writes still go through, including a stale `detachedSince` or `sandboxKey`. Those cannot make a live run look finished, and the new host overwrites them.

So **a terminal status on the record is trustworthy**. A status poller can believe it.

`close()` is outside both fences on purpose. It runs on every teardown path, also the one caused by a lost claim. A fenced `close` leaves the record at `'running'` and every tailer waiting forever, because a durability `read` ends only when the log closes.

### Errors you can branch on

```ts
import {
  RunClaimLostError,
  RunClaimNotAcquiredError,
  RunDriverPipeOutsideClaimError,
} from '@tanstack/ai-sandbox'

export function describeDriveFailure(error: unknown): string {
  if (error instanceof RunClaimNotAcquiredError) {
    // 'terminal' | 'unknown' | 'superseded'. Normal, not a bug.
    return `not driving ${error.runId}: ${error.reason}`
  }
  if (error instanceof RunClaimLostError) {
    return `superseded mid-drive at epoch ${error.heldEpoch}`
  }
  if (error instanceof RunDriverPipeOutsideClaimError) {
    // A programming error: `pipe` ran outside `claim`, so there is no epoch.
    return `run ${error.runId}: pipe ran outside its claim`
  }
  throw error
}
```

The first two are normal results of a contended takeover. `resumeServerSentEventsResponse` already swallows both, so you see them in logs, not in responses.

### What the fence does not cover

The fence is not airtight. An old host that pauses (GC, a VM suspend) for longer than the quiet time, between its last fence check and its append, can still write one batch. Closing that needs a compare-and-set on the durability write, and `StreamDurability.append` has none.

To keep the risk small:

- Use a lease-backed distributed `LockStore`.
- Keep `fenceQuietMs` above the lease's renewal interval.

## Replay and divergence

A takeover does not continue the journal from where the old host stopped. It reads the journal **from byte 0** and translates it again, which makes chunks the client already has. Alignment makes that safe:

1. Read the stored log once.
2. Compare the replay to it, chunk by chunk, by fingerprint.
3. Drop the matching prefix.
4. Append and deliver only the rest.

The log is the checkpoint, so a checkpoint and the log can never disagree. The rule: **the log wins for what clients see, and the journal wins for where the driver resumes.**

Two things make the comparison possible:

- **Ids are deterministic.** A journaled run mints message ids from a run-scoped counter (`<runId>-0`, `<runId>-1`, and so on), not from the clock and randomness.
- **Alignment runs only on an attach.** On a fresh run, the premise "this stream replays what is stored" is false. If it aligned anyway, it matches the fresh run's chunks against old log entries and drops them. That is data loss.

### `JournalReplayDivergedError`

If the replay makes a different chunk than the log holds at that index, `JournalReplayDivergedError` is thrown with the index and both fingerprints:

```ts
import { JournalReplayDivergedError } from '@tanstack/ai-sandbox'

export function report(error: unknown): string {
  if (error instanceof JournalReplayDivergedError) {
    return `diverged at ${error.index}: stored ${error.stored}, replayed ${error.replayed}`
  }
  throw error
}
```

It means: **the replay made a different sequence of events than the log already delivered.** Translation stopped being deterministic. Usual causes:

- An id generator that is not run-scoped.
- A translator that reads the clock.
- A journal that was rewritten. Most often this is a reused `runId`.

Treat it as a bug to fix. Do not catch it and continue. The log already went to the client. A stream past the mismatch has a prefix and a suffix that disagree about message ids, and the client cannot recover. Log the index and both fingerprints, let the run fail, and make sure that every `runId` is unique.

### Bridge events are skipped, up to a limit

`@tanstack/ai-codex` and `@tanstack/ai-claude-code` add host tool-bridge events to their output. The log holds `CUSTOM` chunks from live tool calls, and a replay runs no tools. So alignment skips those chunks, up to `DEFAULT_MAX_OUT_OF_BAND_SKIP` (64) in a row. The limit keeps this a tolerance and not a search. Without it, a real determinism bug scans forward for any fingerprint that happens to match.

### Reuse the record's threadId on attach

`threadId` is in every chunk. An attach that makes a new `threadId` replays a stream whose first chunk already differs from the log. Alignment fails at index 0 with `JournalReplayThreadIdMismatchError`, a subclass of `JournalReplayDivergedError`, even though the agent did the same thing.

So an attaching durable run throws `DurableThreadIdRequiredError` when it has no `threadId`:

- A **fresh** durable run needs no caller `threadId`. That run sets it.
- An **attaching** durable run must reuse the one on the record. `driveRun` in the [setup](./takeover#set-up-the-server) passes `threadId: input.threadId` for this reason.

## What the RunStore must keep

`createOrResume`, `update`, and `get` are required. `update` must accept and return all of these fields:

| Field | What breaks without it |
| --- | --- |
| `status`, `finishedAt`, `error`, `usage` | The run record itself. |
| `driverEpoch` | Fencing. Two hosts can write one run. |
| `cancelRequested` | Stop cannot reach a driver on another host. |
| `detachedSince`, `sandboxKey` | Nothing can find or reclaim the sandbox. |

A hand-written backend most often drops the last four. Two rules also hold:

- `createOrResume` returns an existing record **unchanged**. That makes a resume safe.
- `update` on an unknown `runId` does nothing and does not throw.

`findActiveRun` is required: it is how a client rejoins by thread. `listReclaimable` is optional, but `reapDetachedRuns` needs it. A store without it cannot be reaped. See [Store Reference](../persistence/store-reference).

## Run capabilities

Two capabilities, both owned by core, carry the detach facts between packages. Core owns them so persistence and sandbox agree without one importing the other.

### `DetachableRunCapability`

A boolean that says a disconnect **can** be survived. `withSandbox` sets it to `true` at setup, only when a run is durable. `withPersistence` reads it with `getOptional` to choose:

- Not detachable: an abort is final, so it writes `'aborted'`.
- Detachable: a plain disconnect writes nothing.

Read it in your own middleware if you need the same choice. Absent means "not detachable", which is every app without durability.

### `RunDetachedCapability`

The past-tense partner. `withSandbox` publishes it on the abort path, from its detach branch. It says the run **was** detached: the agent still works, and a later attach can take it over.

Its reader is the durable delivery sink behind `toServerSentEventsResponse` and `toHttpResponse`. Without the verdict, the sink closes the log on every abort, and takeover fails (see [What each path writes](./takeover#what-each-path-writes)). The fact travels on the stream object itself, so you wire nothing: you already pass `chat()`'s stream to the response helper.

```ts
import { provideRunDetached } from '@tanstack/ai'
import type { CapabilityContext } from '@tanstack/ai'

// You do not write this. withSandbox does, on its detach branch.
// Shown only so the fact is visible.
export function markRunDetached(ctx: CapabilityContext): void {
  provideRunDetached(ctx, true)
}
```

Only a plain disconnect of a detachable run publishes it. These leave it unpublished, and the sink appends its terminal event and closes the log:

- A cancel on either path.
- A disconnect on a run that is not detachable.
- `detachOnDisconnect: false`.
- A provider failure.
- A normal finish.

Core also refuses to treat an abort with `RUN_CANCEL_REASON` as a detach, whatever a middleware publishes. A Stop always gets a closed, terminal log.

## For harness adapter authors

If you write a harness adapter, three exports are yours:

- `getSandboxDurability` reads the resolved durability from the capability bus.
- `journalOptionsFor` turns it into the journal option that `spawnNdjson` takes.
- `alignedIfAttaching` applies alignment on an attach only.

Wrap the **merged** output stream, never the translator before the merge. Otherwise you compare against a stream the log never held. See [Harnesses](./harnesses).
