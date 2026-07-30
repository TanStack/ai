---
'@tanstack/ai': minor
'@tanstack/ai-durable-stream': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-cloudflare': patch
'@tanstack/ai-sandbox-daytona': patch
'@tanstack/ai-sandbox-docker': patch
'@tanstack/ai-sandbox-local-process': patch
'@tanstack/ai-sandbox-sprites': patch
'@tanstack/ai-sandbox-vercel': patch
'@tanstack/ai-claude-code': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-grok-build': minor
---

A sandboxed agent's output now survives the host that started it. The agent writes newline-delimited JSON to a **journal** file inside the sandbox instead of into a pipe the host holds, so the host can return, die, or be replaced without taking the agent down with it, and a bounded read of the already-stored event log lets a successor line its own output up against the prefix a previous host delivered.

This entry covers the journal, the journal reader, and the alignment primitive — the substrate the rest of the durable-run surface is built on. Detach, takeover, out-of-band cancel, and the reaping sweep ship in the same release and are described in their own entries: `RunRecord.cancelRequested` is written by `requestRunCancel` (`@tanstack/ai`), `detachedSince` and `sandboxKey` are written by `withSandbox`'s detach branch (`@tanstack/ai-sandbox`), and `sandboxRunDriver`, `reapDetachedRuns`, and `pruneJournals` all ship from `@tanstack/ai-sandbox`'s root. What the pieces below give you on their own is: run an agent through a journal, read that journal back from byte 0, and replay a journal against a stored log without duplicating what is already there.

### `@tanstack/ai`: `StreamDurability.snapshot`

`StreamDurability` gains a required `snapshot`:

```ts
snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
```

Everything stored for the run at the moment of the call, in append order, then resolve. It never tails and never waits for more entries, it resolves to `[]` for a run with nothing stored rather than throwing, and it returns a fresh array whose pair objects do not reach the stored log. The result carries no lock, so the last returned offset is not a permanent tail.

It exists because `read` is the only read the interface had, and `read` tails: it parks until the log is terminalized with `close()` or the caller aborts. A crashed producer never calls `close()`, so its log stays open forever and `for await (const entry of read('-1'))` over it never finishes. A producer resuming that run could not inspect the log at all. `snapshot` is the read that returns.

**Breaking for a custom `StreamDurability`.** The interface is public and shipped in `0.42.0`, so an existing implementation stops compiling until it adds the method. The migration is one method: return your stored entries as `{ offset, chunk }` pairs in append order without waiting, and return `[]` for an unknown run.

`memoryStream` implements it by peeking at its log map rather than creating one, so an unknown run resolves to `[]` and no empty never-completed log is left behind for the sweep to miss.

### `@tanstack/ai-durable-stream`: bounded snapshot over the existing protocol

`durableStream` implements `snapshot` with no protocol change. The control frame already carried an `upToDate` field that the parser validated and `read` then ignored; `read` and `snapshot` now share one window-pulling loop whose only difference is whether `upToDate: true` ends it. A live `read` keeps long-polling past it, a `snapshot` returns there, which is what makes a snapshot bounded on a stream nobody ever closed.

Two honest limits:

- It is bounded by an internal ceiling of 1000 windows. A conforming backend reports `upToDate` within one or two windows; a backend that keeps handing out advancing windows without ever reporting it gets a `DurableStreamError` rather than a read that never returns.
- It cannot return `[]` for a stream the backend never created. A snapshot must not create a stream as a side effect of reading, so an unknown stream surfaces whatever status the backend returns for it instead of an empty result. `memoryStream` is the implementation that satisfies the empty-run clause exactly.

### `@tanstack/ai-sandbox`: the journal

The substance of the phase.

**The journal.** An agent's NDJSON stdout is redirected to `/tmp/tanstack-runs/<runId>.ndjson` with its stderr in a `<runId>.err` sidecar and an `{"__exit":N}` sentinel appended when it exits. Because the host holds no handle on the agent's output, there is no pipe to `SIGPIPE`: a trigger can start the agent and return while the agent keeps writing.

- `spawnNdjson` takes a new `journal?: { runId; dir?; attach?; pollIntervalMs? }`.
- `startJournaledAgent(handle, command, options)` starts the agent and returns without waiting for it or reading its stdout. Stdin is still written directly to the process.
- `readJournalNdjson(handle, options)` reads a journal from byte 0 as parsed NDJSON, stops at the sentinel, and throws for a non-zero exit code so a calling adapter's existing `catch` turns it into a `RUN_ERROR`, the same observable outcome the unjournaled path produces from a non-zero `wait()`. The sentinel is the exit code here; there is no process to `wait()` on.
- `DEFAULT_JOURNAL_DIR`, `EXIT_SENTINEL_KEY`, `journalPaths`, `journaledCommand`, `journalFollowCommand`, `journalReadCommand`, `journalExistsCommand`, plus `decodeBase64Stream` and `toJournalLines` for byte-exact decoding and line splitting.

**A `runId` must be unique per run.** The journal is append-only on purpose, because a takeover depends on the prefix a previous host delivered still being there, and `DEFAULT_JOURNAL_DIR` is a fixed absolute path that outlives any single sandbox, test, or process. A reused `runId` therefore does not start a fresh journal, it appends behind the previous run's sentinel, and a reader stops at the FIRST sentinel it sees: the new run appears to emit nothing, or to fail with the old run's exit code. This is deliberately not enforced, since refusing to append would break the append-only property the takeover relies on. **Durability therefore requires a caller-supplied `runId`**, and the harness adapters no longer paper over its absence: `resolveDurableRunId` throws `DurableRunIdRequiredError` when sandbox durability is wired and no `runId` was passed, and only falls back to a generated id on a non-durable run. A random fallback is not recomputable by any successor, so no successor could derive the journal path.

**The reader.** `readJournal` and `journalReadStrategy(handle)` pick between two strategies. `follow` uses `tail -f` and requires both `backgroundProcesses` and `killableProcesses`; everything else falls back to a bounded poll, because a follower that cannot be stopped would leak an unstoppable process inside the sandbox. The follow path is streamed rather than buffered, and honors an `AbortSignal` itself instead of blocking on `stdout` until a best-effort kill closes the pipe.

**Alignment.** `alignToStoredLog` replays a journal from byte 0, reads the stored prefix once and eagerly through `snapshot()`, suppresses the chunks the log already holds, and forwards the remainder with plain `append`. On a mismatch it throws `JournalReplayDivergedError(index, stored, replayed)` rather than forwarding chunks whose prefix and suffix disagree about message identity. It appends and never upserts by design: `memoryStream.upsert` rejects an offset it did not mint, and `durableStream` has no `upsert` at all because its offsets embed a backend-assigned cursor. Deriving the dedupe boundary from the log means there is no window in which a checkpoint and the log can disagree. Supporting pieces: `createRunScopedIdGen(runId)` (a counter with no clock and no randomness) and `chunkFingerprint` (every field except the wall-clock `timestamp`).

**Journal lifetime.** Reaching the sentinel means the run is terminal and the event log is now the run's record, so both journal files are deleted before `readJournalNdjson` finishes. The ordering is load-bearing and asserted: the follower is stopped before its input is removed, and the stderr sidecar is read for the error message before the deletion that destroys it. A stream that ends without a sentinel deletes nothing, since the run may be mid-flight and a successor may still need every byte. This per-run cleanup covers only the runs a host watched to completion: a run that reaches its sentinel while detached has no reader, so nothing observes the sentinel. `pruneJournals` (see the `reapDetachedRuns` entry) is the sweep that bounds those, deleting a journal only once its run is provably terminal and keeping everything it cannot prove dead.

**Conformance.** `runJournalConformance` and `JournalConformanceConfig`, reachable from `@tanstack/ai-sandbox/testkit`, so a provider can prove its journal behavior against the same suite the bundled providers run.

#### Breaking: `SandboxCapabilities.killableProcesses`

```ts
killableProcesses: boolean
```

New and required. `true` when a spawned process can be terminated through `SpawnHandle.kill` and aborted mid-flight through the `signal` passed to `SandboxProcess.spawn`. A bring-your-own provider stops compiling until it declares one, which is the point: an omitted field would default to killable and leak an unstoppable follower into the sandbox. Migration is one line. Callers must branch on it before relying on `kill` or abort to reclaim a background process.

Every bundled provider declares it. Cloudflare declares `false`, because its `kill()` is a no-op and Workers RPC cannot serialize an `AbortSignal`, so a `tail -f` started there can only be polled and abandoned.

### `@tanstack/ai-sandbox-local-process` and `@tanstack/ai-sandbox-docker`: UTF-8 decoding fix

Separate from the journal work and older than it. Both decoded spawn stdout and stderr with a per-chunk `Buffer.toString('utf8')`, which corrupts any multi-byte UTF-8 character a Node stream happens to split across two `data` events: each half decodes independently into a replacement character. Both now use a streaming `TextDecoder` that retains a partial trailing sequence across calls and flushes once at end of stream, so a genuinely truncated sequence still surfaces as `U+FFFD` instead of being dropped. This is a correctness fix in its own right and applies to every consumer of these providers, journaled or not.

### `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-grok-build`: deterministic ids on the journaled path

All three now route agent stdout through the journal and mint message ids with `createRunScopedIdGen(runId)` instead of `generateId()`, so re-translating the same journal bytes produces the same chunk sequence. `generateId()` mixes in `Date.now()` and `Math.random()`, which makes "same bytes produce same chunks" false.

**Visible behavior change: message id format.** Ids on the journaled path go from a provider-prefixed random id such as `grok-build-1785...-x7f2q` to `<runId>-0`, `<runId>-1`, and so on. Anything that parses a provider prefix out of a message id, or assumes ids are globally unique across runs rather than unique within one, is affected.

The determinism guarantee is **translator-level**, not stream-level. On codex and claude-code the adapter wraps the translator in `mergeChunkStreams(translated, channel.stream)`, splicing host-tool-bridge custom events from live tool execution into the middle of the stream. Those events do not occur on a replay at all, and even on the original run their interleaving position is timing-dependent rather than derivable from the journal. A run that used bridged tools can therefore still diverge post-merge. Nothing in this phase closes that.
