---
title: Run Journal Internals
id: sandbox-journal-advanced
description: "Read a sandbox run journal yourself, handle stalled reads, seed exit sentinels, and replay a journal against a log the client already has."
keywords:
  - readJournal
  - journalReadStrategy
  - awaitAttachableJournal
  - exitSentinelLine
  - alignToStoredLog
  - JournalReplayDivergedError
  - pruneJournals
---

Use this page when you build on the [run journal](./journal) directly: your own reader, a custom harness, a test that seeds a journal, or a replay against an existing log. For normal apps, [Takeover & Detached Runs](./takeover) does all of this for you.

## Read a journal

`readJournal` yields one complete line at a time. Each line carries `endPosition`, the byte offset right after its newline. It never yields a partial line, so `endPosition` is always a safe offset to resume from.

```ts
import { journalPaths, readJournal } from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export async function tailRun(handle: SandboxHandle, runId: string) {
  for await (const { line, endPosition } of readJournal(handle, {
    paths: journalPaths(runId),
  })) {
    console.log(endPosition, line)
  }
}
```

The journal is only ever touched through the shell (`handle.process`), never through `handle.fs`. On the local-process provider, `fs.write` puts `/tmp` under the sandbox root, but a shell redirect writes to the real host `/tmp`. If you write your own journal tools, keep them on `handle.process` too.

A non-zero exit puts the end of the `.err` file in its error message.

## Follow or poll

The reader picks a strategy from the handle's capabilities, never from the provider name:

| Capabilities | Strategy | How it reads |
| --- | --- | --- |
| `backgroundProcesses` and `killableProcesses` | `'follow'` | One killable `tail -c +N -f`. No polling cost. |
| Anything else | `'poll'` | A loop of short `exec` calls, every 250 ms (`DEFAULT_JOURNAL_POLL_MS`). Each call ends on its own, so nothing that cannot be stopped starts in the sandbox. |

A bring-your-own provider with the same limits gets the same strategy. See [`killableProcesses`](./providers#capabilities) for what each provider declares.

To force a strategy for a diagnostic:

```ts
import {
  journalPaths,
  journalReadStrategy,
  readJournal,
} from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export function pollRun(handle: SandboxHandle, runId: string) {
  console.log(journalReadStrategy(handle)) // 'follow' | 'poll'

  return readJournal(handle, {
    paths: journalPaths(runId),
    strategy: 'poll',
    pollIntervalMs: 100,
  })
}
```

## A read fails instead of waiting forever

`readJournal` waits at most 10 seconds (`DEFAULT_ATTACH_JOURNAL_WAIT_MS`) for the journal's first byte. If nothing arrives, it throws `JournalAttachUnavailableError` with `reason: 'journal-stalled'`.

The bound is needed because a follow read first creates the file (`: >> file`) so it can tail it. Without a bound, a read for a run that never existed creates an empty file and follows it forever. Only the first byte is bounded. After that, a slow agent is never cut off.

```ts
import {
  JournalAttachUnavailableError,
  journalPaths,
  readJournal,
} from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export async function tailWithStallGuard(handle: SandboxHandle, runId: string) {
  try {
    for await (const { line } of readJournal(handle, {
      paths: journalPaths(runId),
      runId,
    })) {
      console.log(line)
    }
  } catch (error) {
    if (
      error instanceof JournalAttachUnavailableError &&
      error.reason === 'journal-stalled'
    ) {
      // The journal exists, but nothing writes to it and no sentinel can come.
      // The run's shell was killed, or this read created an empty file.
      return
    }
    throw error
  }
}
```

Set `firstByteTimeoutMs` to change the wait. `0` turns the bound off. Do that only when another deadline already covers the read, because an unbounded read of an empty journal never returns.

## Check the run before you attach

`readJournal` has no run store. An unknown run, a finished run, and a live run that has not written yet all look the same to it. So they all get the full wait.

If you have the `RunStore`, call `awaitAttachableJournal` first. It reads the run record, so a stale or mistyped `runId` fails at once:

| `reason` | Meaning |
| --- | --- |
| `'unknown-run'` | The store has no record for this run. |
| `'terminal-run'` | The run already finished. |
| `'journal-timeout'` | The record is live, but no journal appeared within the wait. |

```ts
import { awaitAttachableJournal, journalPaths } from '@tanstack/ai-sandbox'
import type { RunStore } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

// Pass the same RunStore that withSandbox gets.
export async function gateAttach(
  handle: SandboxHandle,
  runs: RunStore,
  runId: string,
) {
  await awaitAttachableJournal(handle, {
    paths: journalPaths(runId),
    runId,
    runs,
  })
  // Call readJournal only after this resolves.
}
```

On an attach route, `withSandbox` uses the same wait. Change it with `durability.attachWaitMs`.

## The exit sentinel

The sentinel line carries a per-run nonce:

```json
{"__exit":0,"__nonce":"3f9c1a7b..."}
```

The agent's stdout and the sentinel go into the same file, with no framing. Without the nonce, an agent that prints `{"__exit":0}` (an echoed fixture, a dumped config) looks finished while it still works. The reaper then destroys a live sandbox.

How the reader protects against that:

- **The nonce** is `sha256('tanstack-ai-sandbox/journal-exit-sentinel/v1:' + runId)`, cut to 32 hex characters.
- **The scan runs from the end.** The shell always writes the real sentinel after all of the agent's output.
- **A non-integer `__exit` is refused**, not read as `0`.

The nonce is derived, not random, because the reaper reads journals for hosts that are gone. It has only the `runId`, so it must be able to compute the same nonce. The cost: an agent that knows its own `runId` and copies the formula can still forge the line on purpose. Accidental forgery is closed. Closing deliberate forgery needs a secret on the run record, which is a `RunStore` schema change.

If you seed a journal by hand (a test, a fixture, a custom harness), write the sentinel with `exitSentinelLine`. It produces the same bytes as the shell:

```ts
import { exitSentinelLine, journalPaths } from '@tanstack/ai-sandbox'

export function seedSentinel(runId: string, exitCode: number): string {
  // '{"__exit":0,"__nonce":"..."}'. Append this, not a hand-written object.
  return exitSentinelLine(journalPaths(runId), exitCode)
}
```

## A runId must be unique per run

`/tmp/tanstack-runs` is a fixed path that outlives any one run, test, or process. A reused `runId` appends to the old journal, after the old run's sentinel. A reader stops at the last sentinel in its tail window, so the second run looks empty or failed.

This is not enforced, because a refusal to append breaks the replay that the append-only rule exists for. Get the id from something unique per run (a UUID, or the client's own `runId`). Never hardcode a literal, not even in tests.

## Replay against a log you already delivered

The rule: **the log wins for what clients see, and the journal wins for where the driver resumes.**

Say a host translated journal bytes 0 to 1000, appended the chunks to a [resumable-stream](../resumable-streams/overview) log, and then died. The client has those chunks. A new host that reads the journal from byte 0 makes them again. If it appends them again, the client breaks:

- The client de-dups on the offset that the durability adapter mints, so a re-appended chunk looks new.
- The stream processor joins text deltas and tool-call arguments with no check. You get doubled prose and `{"a":1}{"a":1}` arguments.

`alignToStoredLog` prevents this. It reads the stored log once with `snapshot()`, makes sure the replay reproduces it, drops that prefix, and yields only the rest:

```ts
import { memoryStream } from '@tanstack/ai'
import { alignToStoredLog } from '@tanstack/ai-sandbox'
import type { StreamChunk } from '@tanstack/ai'

export async function forwardRemainder(
  request: Request,
  replayed: AsyncIterable<StreamChunk>,
) {
  const durability = memoryStream(request)
  for await (const chunk of alignToStoredLog(replayed, { durability })) {
    await durability.append([chunk])
  }
}
```

It uses plain `append`, in order, with offsets the adapter mints. So it works on `durableStream` as well as `memoryStream`. See [Offset ownership](../resumable-streams/advanced#offset-ownership).

**Ids are deterministic.** Alignment can only match a stored chunk if the replay reproduces it exactly. So a journaled run mints message ids from a run-scoped counter: `<runId>-0`, `<runId>-1`, and so on. Ids stay unique and opaque. Do not parse them.

**What is compared.** Every field takes part, including nested tool-call arguments and fields set to `undefined`. Only `timestamp` is skipped, because it is wall-clock time.

**Divergence throws.** If the replay makes a different chunk than the log holds at the same index, `alignToStoredLog` throws `JournalReplayDivergedError` with the index and both fingerprints. It never forwards the mismatch:

```ts
import { JournalReplayDivergedError } from '@tanstack/ai-sandbox'

export function describe(error: unknown): string {
  if (error instanceof JournalReplayDivergedError) {
    return `chunk ${error.index}: stored ${error.stored}, replayed ${error.replayed}`
  }
  throw error
}
```

A loud failure is correct here. The other choice is corrupt delivery, and the client has no safety net below its offset de-dup. A divergence means translation stopped being deterministic. That is a bug to fix. See [what to do about it](./takeover-advanced#journalreplaydivergederror).

**What determinism does not cover.** The promise is: the same journal bytes translate to the same chunks. Two outputs are outside that:

- On `@tanstack/ai-codex` and `@tanstack/ai-claude-code`, the output also carries host tool-bridge events from live tool calls. A replay runs no tools, and the timing of those events changes. Alignment skips a bounded number of them. Past that bound the run diverges, and it says so.
- `grokBuildText` adds git-diff chunks after the translated stream ends. They come from a shell call, so a replay cannot reproduce them. They appear only at the end of a run that completes.

## Journal lifetime

A reader deletes both files when it sees the sentinel, for any exit code. A read that ends with no sentinel (the consumer stopped, the client left) deletes nothing, because the run can still be live.

A run that reaches its sentinel with no reader keeps its files. `pruneJournals` cleans those up: it deletes only journals whose runs the `RunStore` reports as finished. Like the reaper, your app must schedule it. See [Reaping & Retention](./reaping).

A journal also dies with its sandbox. On a provider with `durableFilesystem: false` (Cloudflare is the bundled one), the journal lives only as long as the container. To keep output past the sandbox, you need the log-first tier. See [the two tiers](./durable-runs#the-two-tiers).

## Do not hand-roll takeover

`alignToStoredLog` stops one writer from re-appending its own prefix. It does nothing about two writers. Two hosts that append to one log bring back the doubled delivery above. A host that lost the run can also mark it finished while the new host still streams it.

`sandboxRunDriver` closes both. It:

1. Claims the run under a lease.
2. Bumps a fencing epoch, so the old host cannot append.
3. Waits for the log to go quiet.
4. Replays the journal from byte 0 through `alignToStoredLog`.
5. Appends only the rest.

Use it. See [Takeover & Detached Runs](./takeover).
