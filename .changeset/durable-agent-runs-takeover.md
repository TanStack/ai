---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-grok-build': minor
'@tanstack/ai-acp': patch
'@tanstack/ai-opencode': minor
---

A sandboxed agent's run now survives a disconnect and can be picked back up by a later request instead of being torn down with the connection that started it. Wire `runs` + `durability` into `withSandbox` (the same `RunStore` chat persistence uses) and a disconnect on a durable run leaves the agent running, records `detachedSince`, and a later attach for the same `runId` replays the stored log, aligns against it, and keeps streaming from where the previous host left off.

- **Single-writer enforcement.** A durable run is driven under a lease (`locks.withLock`) plus an `epoch` fence (`RunRecord.driverEpoch`, re-checked every 32 appends) plus a quiescence gate over `snapshot()` before a successor starts appending. A superseded driver's append is refused (`RunClaimLostError`) and, separately, its refusal can no longer terminalize the run record it lost the claim to — only the current claim holder may write a terminal status.
- **`sandboxRunDriver`** (`@tanstack/ai-sandbox`) wires the claim and the run log together so an app supplies `request`/`runs`/`locks`/`durability`/`drive` rather than hand-rolling the claim/fence sequencing itself.
- **Out-of-band cancel.** `requestRunCancel(runs, runId)` (durable — reaches a run being driven by a different host) and the `RUN_CANCEL_REASON` abort sentinel (in-process — fast path when the cancel reaches the driving host) are the only two channels that carry cancel intent; a plain disconnect and an explicit Stop produce the identical TCP close and are no longer conflated. `wasCancelRequested` reads the durable flag back; a store failure degrades to a detach rather than throwing, since a scheduled TTL reaper (see the `reapDetachedRuns` changeset) can still reclaim a stuck detach — provided the application actually schedules it; nothing sweeps `detachedSince` on its own.
- **`@tanstack/ai-persistence`'s `onAbort` now distinguishes the two.** An explicit cancel (either channel) or a non-detachable run writes terminal `'aborted'`. A plain disconnect on a detachable run writes nothing — the record stays `'running'` for a later attach to resume, rather than the previous behavior of marking every disconnect `'interrupted'` with a terminal `finishedAt`.
- **`ai-codex`, `ai-claude-code`, `ai-grok-build`, `ai-opencode`** thread the durable `runId` through their journal and attach paths: `resolveDurableRunId` enforces a caller-supplied id whenever sandbox durability is wired (throwing `DurableRunIdRequiredError` otherwise, since a random fallback id is not derivable by a successor), `journalOptionsFor` builds the journal option only when durability is active, and `alignedIfAttaching` wraps the merged output stream so an attach replays and aligns against the stored log instead of restarting the agent. `ai-acp` gets the same `resolveDurableRunId` plumbing with enforcement off (`durable: false`) since it does not journal yet.
- **`makeFakeShellSpawn`** ships from `@tanstack/ai-sandbox/testkit` for exercising the journal/claim/driver seam against a fake shell without a real sandbox provider.
- **`RunError` in `@tanstack/ai-persistence`'s conformance suite now pins the `undefined`-vs-`false` distinction** on `cancelRequested`, `detachedSince`, `sandboxKey`, and `driverEpoch`: a fresh run must read all four back as `undefined` (not a coerced falsy default), and an explicitly-written `cancelRequested: false` must round-trip as `false`, distinct from the unset case.

### Breaking: `@tanstack/ai-sandbox`'s `RunDeps.durability` is now a per-run factory

```diff
 export interface RunDeps {
   runs: RunStore
-  durability: StreamDurability
+  durability: (runId: string) => StreamDurability
 }
```

A single `StreamDurability` instance is bound to one run (a backend adapter's offsets embed a cursor into one log), so holding one instance let a caller silently mis-bind a run at concurrency 1 (`start({ runId })` accepted an arbitrary id while the instance stayed bound to whatever run it was constructed for, writing the lifecycle record under one id and the events under another with no error) and let concurrent runs cross-talk (parallel runs interleaved into the same log, and whichever finished first `close()`d every other run's stream too). `pipeToRunLog` and `RunController` now resolve the log FROM the `runId` being driven, once per run, which makes both failures unrepresentable. `RunController.attach` and the rest of its per-run surface now take `runId` explicitly instead of assuming a single bound log.

**Not released — this stays a minor, not a major.** The durability surface introduced in earlier phases of this branch has not shipped in a published version, so this break reaches no released consumer. Migration for anyone building against the unreleased surface: change `durability` from an instance to `(runId) => StreamDurability`, and pass `runId` to `RunController.attach`.

### Breaking: `@tanstack/ai-persistence`'s `onAbort` no longer marks every disconnect `'interrupted'`

`onAbort` used to write `status: 'interrupted'` with a terminal `finishedAt` on every abort, including a plain disconnect. `'interrupted'` is not supposed to be terminal-shaped (`isTerminalRunStatus('interrupted')` is `false`), so stamping a terminal timestamp on it told every reader the run was over while it might only be paused or still streaming elsewhere. `onAbort` now branches: an explicit cancel or a non-detachable run calls the new `abortRun` helper (`status: 'aborted'`, terminal); a plain disconnect on a detachable run writes nothing at all, leaving the record `'running'` for a later attach.

**Migration:** a reader that treated every post-abort record as `'interrupted'` with a `finishedAt` must instead handle a `'running'` record with no `finishedAt` as "detached, possibly resumable" rather than "over." `withGenerationPersistence`'s `onAbort` is unaffected — a generation job has no journal or agent loop to reattach to, so it still unconditionally finalizes as `'aborted'`.

### Not breaking, called out for completeness: `AbortInfo.cancelRequested` now populates

Declared as a placeholder in an earlier phase and unpopulated; core now sets it from the abort reason (`true` when the abort reason is the `RUN_CANCEL_REASON` sentinel, `false` otherwise). Purely additive in the type sense — this widens what was already `boolean | undefined` toward a real value — but is a **behavior** change worth flagging: middleware reading this field to distinguish an explicit cancel from any other abort now gets a real answer instead of always `undefined`.
