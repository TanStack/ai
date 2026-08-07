---
title: The Run Journal (Advanced)
id: sandbox-journal
order: 12
description: "Agent NDJSON output lives in an append-only file inside the sandbox so hosts read a file, not a pipe."
keywords:
  - run journal
  - readJournal
  - journalPaths
  - alignToStoredLog
  - killableProcesses
  - exitSentinelLine
  - awaitAttachableJournal
  - journal-stalled
---

# The Run Journal

If the host holding the agent's stdout dies mid-run → without a journal the pipe breaks, the agent gets `SIGPIPE`, and work is gone.

**Fix:** redirect agent stdout to a file; host tails it:

```
/tmp/tanstack-runs/<runId>.ndjson    events
/tmp/tanstack-runs/<runId>.err       stderr (separate)
```

No pipe reader → no `SIGPIPE`. Any reader can start at byte 0.

## Opt in (both stores)

**Must:** durable run = `withSandbox(sandbox, { runs, durability: { adapter } })`.

Pass neither or only one → no journal (silent). `opencodeText` / `acpCompatible` never journal.

## Forward a recomputable `runId`

Path = `runId` only. Durable run without caller `runId` → `DurableRunIdRequiredError`.

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
import { sandbox } from './sandbox'

const persistence = memoryPersistence()
const { runs } = persistence.stores

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)
  const stream = chat({
    adapter: claudeCodeText('claude-sonnet-4-6'),
    messages,
    threadId,
    runId,
    middleware: [withSandbox(sandbox, { runs, durability: { adapter } })],
  })
  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

`useChat` already mints a unique `runId` per turn. Multi-replica → [Takeover](./takeover).

### Unique per run

**Cause:** reuse `runId`.  
**Effect:** append after old exit sentinel → reader stops early; empty/wrong exit. No throw.  
**Fix:** UUID or client `runId`; never hardcode.

## Read a journal

```ts
import { journalPaths, readJournal } from '@tanstack/ai-sandbox'
import { handle } from './sandbox-handle'

async function tailRun(runId: string) {
  for await (const { line, endPosition } of readJournal(handle, {
    paths: journalPaths(runId),
  })) {
    console.log(endPosition, line)
  }
}
```

Yields complete lines only; `endPosition` is a resume byte offset. Fresh run = N = 0.

- Touch journals only via **shell** (`handle.process`), not `handle.fs.*` (local-process `/tmp` mismatch).
- Stderr is a sidecar — never spliced into event bytes.

### Follow vs poll

Strategy from `backgroundProcesses && killableProcesses` (capability, not provider name). Force for diagnostics:

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

## Exit sentinel + nonce

Shell appends after agent exit:

```json
{"__exit":0,"__nonce":"3f9c1a7b..."}
```

**Cause:** bare `{"__exit":N}` could appear in agent output → reaper kills live sandbox.  
**Fix:** `__nonce` = `sha256('tanstack-ai-sandbox/journal-exit-sentinel/v1:' + runId)` (32 hex). Derived so reaper recomputes from `runId` alone. Parse scans tail **backwards**; non-integer `__exit` refused.

Residual: agent that knows `runId` and reimplements the hash could forge — needs a `RunStore` secret to close fully.

Hand-seed with `exitSentinelLine(paths, exitCode)`:

```ts
import { exitSentinelLine, journalPaths } from '@tanstack/ai-sandbox'

function seedSentinel(runId: string, exitCode: number): string {
  return exitSentinelLine(journalPaths(runId), exitCode)
}
```

## `'journal-stalled'`

First-byte wait defaults to `DEFAULT_ATTACH_JOURNAL_WAIT_MS` (10s). Timeout → `JournalAttachUnavailableError` with `reason: 'journal-stalled'`.

**Cause:** attach used to create empty file then follow forever.  
**Fix:** bound first byte only; healthy thinking between lines is unlimited.

```ts
import {
  JournalAttachUnavailableError,
  journalPaths,
  readJournal,
} from '@tanstack/ai-sandbox'
import { handle } from './sandbox-handle'

async function tailWithStallGuard(runId: string) {
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
      // empty/missing journal; no sentinel coming
    } else {
      throw error
    }
  }
}
```

Override with `firstByteTimeoutMs` (`0` disables — only if another deadline covers you).

### Gate attach first

`awaitAttachableJournal` uses `RunStore` → fail fast `'unknown-run'` / `'terminal-run'` instead of full wait:

```ts
import { awaitAttachableJournal, journalPaths } from '@tanstack/ai-sandbox'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { handle } from './sandbox-handle'

const { runs } = memoryPersistence().stores

async function gateAttach(runId: string) {
  await awaitAttachableJournal(handle, {
    paths: journalPaths(runId),
    runId,
    runs,
  })
}
```

## Align replay to a delivered log

**Rule:** log wins for clients; journal wins for driver resume.

Replaying from byte 0 re-derives chunks already delivered. Re-appending them doubles text/tool args (client de-dup is by durability offset).

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

Ids on journaled path: `<runId>-0`, `<runId>-1`, … (deterministic). Comparison excludes wall-clock `timestamp`.

Mismatch → `JournalReplayDivergedError` — treat as bug (id generator, clock in translator, reused `runId`). Do not catch and continue.

Host-tool-bridge events and post-stream git-diff chunks may not replay; alignment tolerates out-of-band `CUSTOM` up to a bound on Codex/Claude Code.

**Do not hand-roll multi-writer takeover** — use `sandboxRunDriver` ([Takeover](./takeover)).

## Lifetime

| Situation | Journal files |
| --- | --- |
| Reader sees exit sentinel | Deleted |
| Read ends without sentinel | Kept (run may still be live) |
| Sentinel with no reader | Survives until [pruneJournals](./reaping) / sandbox destroy |

`durableFilesystem: false` (e.g. Cloudflare) → journal lifetime = container lifetime. Outliving sandbox needs log-first tier → [Durable Runs](./durable-runs).

## What you can build

- Host dies → agent keeps working; output on disk.
- Any process with handle + `runId` → `readJournal` from byte 0.
- Exact replay against delivered log via `alignToStoredLog`.

## See also

[Durable Runs](./durable-runs) · [Takeover](./takeover) · [Providers](./providers) · [Harnesses](./harnesses) · [Resumable Streams Advanced](../resumable-streams/advanced) · [Custom Durability Adapter](../resumable-streams/custom-adapter)
