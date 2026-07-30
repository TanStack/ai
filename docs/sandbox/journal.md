---
title: The Run Journal
id: sandbox-journal
order: 12
description: "Every sandboxed agent run writes its NDJSON output to an append-only journal inside the sandbox, so the host reads a file instead of holding a pipe."
keywords:
  - run journal
  - readJournal
  - journalPaths
  - alignToStoredLog
  - killableProcesses
---

# The Run Journal

A sandboxed coding agent can work for ten minutes. If the host process holding
the agent's stdout pipe goes away in minute three, that pipe breaks, the agent
gets a `SIGPIPE`, and the work is gone. Nothing is left to read, because the
only copy of the agent's output was in flight.

So the agent does not write to a pipe. Its stdout is redirected to a file inside
the sandbox, and the host tails that file:

```
/tmp/tanstack-runs/<runId>.ndjson    every NDJSON event the agent emitted
/tmp/tanstack-runs/<runId>.err       the agent's stderr, kept separate
```

Because there is no pipe, there is no reader whose disappearance can signal the
agent. And because the journal is a file, a reader can start at byte 0 whenever
it likes.

## You have to ask for a journal

**Journaling is not on by default, and this is the first thing to get right —
everything else on this page assumes the file exists.** The three built-in
harness adapters (`grokBuildText`, `claudeCodeText`, `codexText`) journal a run
only when that run is **durable**, which means `withSandbox` was given **both**
`runs` and `durability` — `withSandbox(sandbox, { runs, durability: { adapter } })`,
as the snippet below does. Pass neither (a plain `withSandbox(sandbox)`) or only one, and there is no
journal at all: `journalOptionsFor` answers `undefined`, `spawnNdjson` takes its
original unjournaled path, and the agent's stdout is a pipe again, exactly as it
was before this feature existed. Nothing warns — a half-configured app has not
asked for durability, so there is nothing to warn about. If you go looking for
`/tmp/tanstack-runs/<runId>.ndjson` after running a plain `withSandbox(sandbox)`,
you will not find it, and the reason is here rather than in your provider.

Why both: a record with no event log cannot be replayed, and a log with no record
cannot be found, claimed, or reaped. There is no useful half.

## Give every run an id you can recompute

The journal path is derived from `runId` alone, so a `runId` you cannot
reproduce is a journal nobody can find. Adapters fall back to a random internal
id on a **non-durable** run; on a durable one there is no fallback at all —
`chatStream` throws `DurableRunIdRequiredError`, deliberately, because an id no
successor host can recompute produces a run that streams normally and is
silently unrecoverable.

So forward the `runId` the request already carries, alongside the two stores that
turn journaling on:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
// Your `defineSandbox(...)` result.
import { sandbox } from './sandbox'

// Single-process stand-ins, enough to see a journal on your laptop. A real
// deployment needs a store and a stream backend every replica can reach — see
// ./takeover for that wiring, plus the distributed lock it requires.
const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // One instance, handed to both the middleware and the transport, so the
  // journal and the delivery log describe the same run. `memoryStream` reads the
  // run id from the `X-Run-Id` header `@tanstack/ai-client` sends, so it needs
  // no help on a POST route; `durableStream` does — see ./takeover.
  const adapter = memoryStream(request)
  const stream = chat({
    adapter: claudeCodeText('claude-sonnet-4-6'),
    messages,
    threadId,
    // Without this a durable run throws: the journal path and the deterministic
    // message ids are both derived from it, so a later reader can only find the
    // journal of a run whose `runId` it can recompute.
    runId,
    // BOTH options, or there is no journal to read.
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })
  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

`@tanstack/ai-client` mints a fresh `runId` for every run and puts it in the
AG-UI request body, which is what `chatParamsFromRequest` hands back. So the
client half of this is nothing at all: `useChat` already sends a unique id per
run, and reconnecting behaviour is unchanged.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  return (
    <button onClick={() => sendMessage('Refactor the auth module')}>
      Send ({messages.length} messages)
    </button>
  )
}
```

### A `runId` must be unique per run

The journal is append-only, and `/tmp/tanstack-runs` is a fixed absolute path
that outlives any single run, test, or process. Reusing a `runId` therefore does
not start a fresh journal. It appends to the old one, behind the old run's
`{"__exit":N}` sentinel.

A reader stops at the first sentinel it sees. So a reused id makes the second
run look like it emitted no events at all, or like it failed with the previous
run's exit code. Nothing throws, nothing warns: you get a silently empty run.

This is not enforced, because refusing to append would break the replay the
append-only rule exists for. Derive the id from something unique per run (a
UUID, or the client's own `runId`) and never hardcode a literal.

## Reading a journal

`readJournal` yields one complete line at a time, each tagged with the absolute
byte position just past its newline. A partial line the agent is still writing
is never yielded, so a position is always a byte offset you can resume from.

```ts
import { journalPaths, readJournal } from '@tanstack/ai-sandbox'
// A live `SandboxHandle`, e.g. from `provider.create(...)`.
import { handle } from './sandbox-handle'

async function tailRun(runId: string) {
  for await (const { line, endPosition } of readJournal(handle, {
    paths: journalPaths(runId),
  })) {
    console.log(endPosition, line)
  }
}
```

Nothing about that call changes for a run that started five minutes ago under a
different process. Resume is not a separate code path: every read is
`tail -c +N` for some N, and a fresh run is simply N = 0.

Two details worth knowing:

- **The journal is only ever touched through the shell**, never through
  `handle.fs.*`. On the local-process provider, `fs.write` resolves `/tmp`
  under the sandbox root while a shell redirect hits the real host `/tmp`. Both
  halves agree with each other precisely because nothing uses `fs`. If you write
  your own journal tooling, keep it on `handle.process`.
- **Stderr lives in its own sidecar file**, so a `tail` diagnostic or a chatty
  CLI banner can never splice itself into the event bytes. A non-zero exit
  carries the tail of that sidecar in its error message.

### Follow or poll, chosen by capability

Most providers can run a killable `tail -c +N -f` under `spawn`, which streams
with no polling cost. A provider whose spawned processes cannot be stopped gets
a poll loop of bounded `exec` calls instead, each of which terminates on its
own, so nothing unstoppable is ever started inside the sandbox.

The choice reads `backgroundProcesses && killableProcesses` off the handle's
capabilities, never the provider's name, so a bring-your-own provider with the
same limitation is treated the same way. See
[`killableProcesses`](./providers#capabilities) for which providers declare
what.

You can force either strategy for a diagnostic:

```ts
import { journalPaths, journalReadStrategy, readJournal } from '@tanstack/ai-sandbox'
import { handle } from './sandbox-handle'

console.log(journalReadStrategy(handle)) // 'follow' | 'poll'

const lines = readJournal(handle, {
  paths: journalPaths('run-2a7f'),
  strategy: 'poll',
  pollIntervalMs: 100,
})
```

## Replaying a journal against a log you already delivered

A host that translated journal bytes 0 to 1000 and appended the resulting chunks
to a [resumable-stream](../resumable-streams/overview) log, then went away, left
the client holding those chunks. A host reading the same journal from byte 0 will
re-derive them. Appending them a second time corrupts the client: its de-dup is
keyed on the offset the durability adapter minted, so a re-appended chunk looks
new, and the stream processor concatenates text deltas and tool-call arguments
unconditionally. Duplicated prose and `{"a":1}{"a":1}` arguments.

`alignToStoredLog` is the primitive that prevents it. It reads the stored prefix
once with `snapshot()`, checks that the replay reproduces it, suppresses it, and
yields only the remainder:

```ts
import { memoryStream } from '@tanstack/ai'
import { alignToStoredLog } from '@tanstack/ai-sandbox'
import type { StreamChunk } from '@tanstack/ai'

async function forwardRemainder(
  request: Request,
  replayed: AsyncIterable<StreamChunk>,
) {
  const durability = memoryStream(request)
  for await (const chunk of alignToStoredLog(replayed, { durability })) {
    await durability.append([chunk])
  }
}
```

Plain `append`, in append order, with offsets the adapter mints. No caller-chosen
offsets are involved, which is why this works on `durableStream` as well as
`memoryStream`. See
[Offset ownership](../resumable-streams/advanced#offset-ownership).

### Ids are deterministic, so replay is comparable

Alignment can only recognise a stored chunk if re-translation reproduces it, and
a message id built from `Date.now()` plus `Math.random()` never does. So the
journaled path mints ids from a run-scoped counter instead.

The visible consequence: a message id looks like `<runId>-0`, `<runId>-1`, and so
on, rather than `<provider>-<timestamp>-<random>`. Ids remain unique per run and
opaque; if you were parsing them for a provider name or a timestamp, stop.

Comparison excludes `timestamp`, which is wall-clock and cannot be reproduced.
Every other field participates, including nested tool-call arguments and fields
whose value is explicitly `undefined`.

### Divergence throws

If the replay produces a different chunk than the log holds at that index,
`alignToStoredLog` throws `JournalReplayDivergedError` with the index and both
fingerprints. It does not forward the mismatch.

```ts
import { JournalReplayDivergedError } from '@tanstack/ai-sandbox'

function describe(error: unknown): string {
  if (error instanceof JournalReplayDivergedError) {
    return `chunk ${error.index}: stored ${error.stored}, replayed ${error.replayed}`
  }
  throw error
}
```

Loud failure is the right trade here because the alternative is not degraded
delivery, it is corrupt delivery: the client has no safety net below its
offset de-dup, so a duplicate is unsurvivable. A divergence means translation
stopped being deterministic, which is a bug to fix rather than a condition to
recover from.

### What determinism does not cover

The guarantee is translator-level: translating the same journal bytes twice
yields the same chunk sequence.

On `@tanstack/ai-codex` and `@tanstack/ai-claude-code`, the translated stream is
merged with a second stream carrying host-tool-bridge events from live tool
execution. Those events do not occur on a replay, and their interleaving with
translated chunks is timing-dependent in any case. A run that used bridged tools
can therefore still diverge, and it will say so rather than deliver corrupt
data.

`grokBuildText`'s git-diff chunks are also outside translation: they are shelled
out for after the translated stream ends, so they are not reproducible either.
They are emitted only at the tail of a completing run.

## Journal lifetime

Both files are deleted once the reader observes the `{"__exit":N}` sentinel, for
a zero and a non-zero exit alike. A read that ends without a sentinel (the
consumer stopped, the client went away) deletes nothing: the run may still be
in flight and every byte may still be needed.

One case needs a sweep. A run that reaches its sentinel with nobody reading its
journal has no reader to observe the sentinel, so nothing cleans up, and that
journal would survive until the sandbox does not. `pruneJournals` from
`@tanstack/ai-sandbox` bounds it: a sweep over the journal directory that deletes
only the journals whose runs the `RunStore` reports terminal, and keeps
everything else. Like the run reaper, it is a function your application
schedules — see [Reaping & Retention](./reaping).

## What you can build on this today

- **A run whose host dies keeps working.** The agent has no pipe to lose, and
  its output is on disk inside the sandbox.
- **Any process with the sandbox handle and the `runId` can read the whole run
  back**, from byte 0, with `readJournal`.
- **Replay against an already-delivered log is exact**, via `alignToStoredLog`,
  with divergence surfaced rather than swallowed.

And automatic handoff of a live run from one host to another **is** wired up.
`sandboxRunDriver` drives the alignment primitive for you: a successor claims the
run under a lease, bumps the run record's fencing epoch so the predecessor can no
longer append, waits for the stored log to stop growing, replays the journal from
byte 0 through `alignToStoredLog`, and appends only the remainder.

Do not hand-roll that orchestration. `alignToStoredLog` on its own protects one
writer against re-appending its own prefix; it does nothing about *two* writers,
and two hosts appending one log is exactly how the duplicate-delivery corruption
described above reappears — plus a superseded host writing a terminal status over
a run its successor is healthily streaming. The lease, the epoch fence on both
the log and the run record, and the quiescence wait are what close those, and
they are what the driver gives you. See
[Takeover & Detached Runs](./takeover).

## See also

- [Takeover & Detached Runs](./takeover): `sandboxRunDriver`, detach-on-disconnect,
  and single-writer fencing — the wiring that drives everything on this page
- [Providers](./providers): the `killableProcesses` capability and the read
  strategy it selects
- [Harnesses](./harnesses): which adapters journal, and how they derive `runId`
- [Resumable Streams (Advanced)](../resumable-streams/advanced): offset
  ownership and the `snapshot()` read alignment depends on
- [Custom Durability Adapter](../resumable-streams/custom-adapter): the
  five-method contract, including `snapshot()`
