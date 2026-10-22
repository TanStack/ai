---
title: Reaping Internals
id: sandbox-reaping-advanced
description: "Every reaper outcome, the out-of-band journal probe, journal pruning, sandbox reclaim, data retention, and the limits of the detached-run sweep."
keywords:
  - ReapRunOutcome
  - probeRunExit
  - runBudgetMs
  - pruneJournals
  - reclaimSandbox
  - SandboxReclaimFailedError
  - retention
---

Use this page when you run the [reaper](./reaping) in production: to alert on its results, bound the journal directory, plan data retention, or write your own `reclaim`.

## What one sweep does

1. Calls `RunStore.listReclaimable({ now, ttlMs: 0 })` **once**. The store returns runs that are `'running'`, have a `detachedSince`, and have `detachedSince <= now - ttlMs` (inclusive). `ttlMs: 0` returns every detached run, because every one can need finalization. A run that finished one second after the viewer left has an unsaved transcript, and it must not wait out the time limit.
2. Sorts out expired runs in process, against `now - detachedRunTtlMs` (inclusive). The store is not asked twice.
3. Takes up to `maxRuns` (`DEFAULT_MAX_RUNS`, 25). For each run: check expiry first, else probe the journal. Only then claim, wait for quiet, drive, and reclaim.

`listReclaimable` is optional on `RunStore`. A backend without it gets `{ considered: 0 }` and one log line. It cannot be reaped.

The function never rejects. It runs from a cron, an `alarm()`, or a `waitUntil`, where nothing catches errors. So every per-run failure is logged and folded into the `ReapResult`:

- `considered`: runs in this batch, after the `maxRuns` cap.
- `probed`: runs that `hasFinished` was called for.
- `outcomes`: a count per outcome.
- `runs`: one `ReapRunEntry` per run, with `runId`, `outcome`, and when known `status`, `exitCode`, `terminalizedAnyway`, and `error`.

## Outcomes

| Outcome | Meaning |
| --- | --- |
| `finalized` | The probe saw the exit line. The run was driven to a final status, and the transcript is saved. |
| `expired` | Past `detachedRunTtlMs`. Cancelled first, so the teardown is an explicit cancel that destroys the sandbox. Then driven to a final status. The probe is skipped. |
| `producing` | Still working. `pipeToRunLog` never ran: nothing appended, no record written, `close()` not called, `detachedSince` untouched. |
| `unknown` | The probe gave no answer. Left as untouched as `producing`, but an operator must see it. |
| `budget-exceeded` | Finalization only. A run the journal said was finished took longer than `runBudgetMs` to replay. The record is final and the log is closed, so nothing leaks. It points to a fault in the journal read, the translation, or the log. |
| `not-claimed` | Another host holds the claim, or took it during the drive. Normal: a viewer who comes back during a sweep looks like this. |
| `reclaim-failed` | The run is final and the transcript is saved, but `reclaim` threw, so the sandbox is still up. |
| `failed` | Something threw. Logged and counted. The sweep continues. |

Details that matter for alerts:

- **`expired` also covers a budget stop.** On the expiry path, `runBudgetMs` is the designed stop, not an anomaly. The run's `status` tells you which case it was: `completed` if the agent had finished, `aborted` if it was still working when the budget fired.
- **`reclaim-failed` is not retried.** The record is final, so the run has left `listReclaimable` for good. The entry's `error` is your only notice. The shipped `sandboxReclaimer` rejects on a failed destroy so that this outcome can happen.
- **`reclaim-failed` wins over `budget-exceeded`.** The leak is what needs action. The entry keeps the other half in `terminalizedAnyway`: that field is set if and only if the budget was exceeded.

There is no "still running" outcome apart from `producing`, and no "we drove it and it was not finished" outcome. The next section shows why that state cannot happen.

## It never drives a run to learn whether it finished

The tempting design: hand the run to `pipeToRunLog` with a short budget and see if it ends. That fails, because `pipeToRunLog` always writes a final status and always calls `durability.close()`, on every path. Against a run that has not finished, every way a producer can react to the budget is harmful:

| The producer, when the budget fires | Stored status | `close()` |
| --- | --- | --- |
| Ignores it and keeps producing | `aborted` | called |
| Returns (the usual `drive`) | `aborted` | called |
| Throws an `AbortError` | `failed` | called |

`pipeToRunLog` checks its abort signal after its loop too, so an aborted drive is never stored as `completed`. But the status is not the whole harm:

- Every row closes a log that was left open on purpose, which ends every attached client's stream.
- A final record leaves `listReclaimable` for good, so expiry can never reclaim that run's sandbox. That is a cost leak with no recovery.

So the sweep learns that a run finished **out of band**, from the journal in the sandbox. It enters `pipeToRunLog` only for a run that is known to be finished, or one past its time limit (final either way).

What this means for `runBudgetMs` (`DEFAULT_RUN_BUDGET_MS`, 30 seconds):

- **On finalization**, it is only a safety net. If it fires, that is an anomaly (`budget-exceeded`).
- **On expiry**, it does real work. Nothing polls the cancel the reaper records, so the budget is what stops an expired agent that still works. If you expire live agents, a tighter value can make sense.

The sweep also **never clears `detachedSince`**. That field is how the sweep selects runs and how it counts the time limit. If the sweep cleared it, the clock restarts on every sweep, and a detached run never expires. A takeover clears it, because there a real viewer came back.

## `probeRunExit`, and why `hasFinished` is yours

`ReapOptions.hasFinished` is required, and you supply it. `probeRunExit` is the shipped way to answer it:

- It reads the **tail** of the run's journal: 4 KB by default (`DEFAULT_EXIT_PROBE_BYTES`), or `maxBytes`.
- It looks for the [exit sentinel](./journal-advanced#the-exit-sentinel).
- It is read-only: no append, no record write, no `close()`.

It answers with three states, not a boolean, so a failed provider `exec` can never read as "the agent exited":

| Answer | When |
| --- | --- |
| `{ state: 'finished', exitCode }` | The sentinel is in the tail. |
| `{ state: 'producing' }` | No sentinel, or an empty tail. A missing journal also lands here, which is the safe direction: do not touch the run. |
| `{ state: 'unknown', error? }` | Any failure. |

You inject it because two facts sit outside the reaper:

- **The delivery log cannot answer.** After a detach, nothing appends to the log, because the host that appended is gone. The log stops at the last delivered chunk, while the journal keeps growing.
- **Only your app can find a `SandboxHandle`.** `SandboxInstanceStore` has `get`, `upsert`, and `delete`, but no `list`. Mapping `RunRecord.sandboxKey` to a live handle is your app's knowledge.

`ReapOptions.reclaim` is injected for the same reason. `sandboxReclaimer` is the ready-made one.

## `pruneJournals`: bounding the journal directory

The reaper ends runs and destroys sandboxes. It does not tidy the journal directory **inside** a sandbox that stays alive. A `keepAlive` sandbox that serves many turns collects a journal for every run whose exit line no reader saw.

```ts
import { pruneJournals } from '@tanstack/ai-sandbox'
import type { RunStore } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export async function sweepJournals(handle: SandboxHandle, runs: RunStore) {
  // Only `runs.get` is used. The sweep asks about the runIds it finds on
  // disk and never lists the store.
  const result = await pruneJournals({ handle, runs })
  if (result.ageGate === 'unavailable') {
    console.warn('journal sweep: no file-age check, so it kept every orphan')
  }
  return result
}
```

**It keeps a journal unless deletion is proven safe.** The journal is the only copy of the bytes a new host needs to replay an abandoned run. Deleting a live run's journal makes it impossible to resume, with no undo.

| What the store says | Action | Why |
| --- | --- | --- |
| Final (`isTerminalRunStatus`) | **delete** | The delivery log, not the journal, is what a late takeover aligns against. A non-zero exit is final too. |
| Not final, including `'interrupted'` | keep | An interrupt is a pause for a human. Resume continues from that journal. |
| Nothing (unknown runId) | keep until `orphanTtlMs` | The reader creates the journal before the record exists. A run that started moments ago looks unknown. |
| The lookup threw | keep | An unanswered question is not permission to delete. |
| The file name did not decode | keep | A cut-off name can decode to a wrong runId. Then the store answers about another run, maybe a live one. |
| The file-age check is not available | keep every orphan | No age check means no expiry. `unavailable` is a real result, never an empty listing. |

The last row matters most. BusyBox `find` prints "unrecognized option" to stderr and exits 1 with empty stdout. Code that reads that as "no file is newer than the cutoff", and so "every file is old", deletes the whole directory, live runs included. So the age listing includes a self-check line and reports `unavailable` instead of `[]`, and `pruneJournals` keeps everything.

Limits and defaults:

- **`maxDeletes`** caps deletions per sweep (`DEFAULT_MAX_DELETES`, 200). The rest is kept with reason `max-deletes` and handled next time.
- **`orphanTtlMs`** defaults to one hour (`DEFAULT_ORPHAN_TTL_MS`). That is far more than the create-then-record race needs. Too long costs bytes. Too short destroys a live run.
- **It never rejects.** Failures land in `PruneJournalsResult.failures`, and every kept journal is in `kept`, with a reason.

## `reclaimSandbox` and `sandboxReclaimer`

`reclaimSandbox(record, { provider, instances })` destroys the sandbox a final run used. It finds it by `RunRecord.sandboxKey`. The detach path records that key, because the reaper has none of the inputs (thread id, workspace hash, tenant, reuse strategy) to compute it again.

It answers one of:

| Outcome | Meaning |
| --- | --- |
| `'destroyed'` | The provider destroyed it, and the instance record is gone. |
| `'destroy-failed'` | The provider's `destroy` threw. The instance record was still deleted. The sandbox can still bill, and nothing here can reach it now. |
| `'no-sandbox-key'` | The run never had a sandbox. |
| `'not-found'` | No instance record for that key. Nothing to do. |
| `'provider-mismatch'` | The record belongs to another provider. Refused. |

Two orders matter:

- **The provider check comes first**, before `destroy` or `delete`. In a multi-provider app, a Docker container id handed to Daytona's `destroy` can error, or match an unrelated sandbox in Daytona's id space. So a mismatch touches nothing, not even the instance record, which the right provider still needs.
- **`destroy` comes before `delete`, and `delete` runs even if `destroy` threw.** The provider sandbox can already be gone (idle-reclaimed, region wiped, container pruned). An instance record that points at nothing makes the thread's next turn fail to resume. An orphaned provider sandbox is a bounded cost that the provider reclaims. But the outcome is `'destroy-failed'`, not `'destroyed'`, so an operator can tell "torn down" from "can still bill".

`sandboxReclaimer(options)` adapts this to `ReapOptions.reclaim`:

- It logs the outcome and resolves.
- **On `'destroy-failed'` it rejects** with `SandboxReclaimFailedError`, and logs above debug level. A rejection is the only way `reclaim` (a `(record) => Promise<void>`) can say "the sandbox was not reclaimed". This is what makes `reclaim-failed` reachable.
- The reaper calls it only after the record reached a final status, and with the record as first listed. A failed final `update` returns a rebuilt record with no `sandboxKey`. That record answers `'no-sandbox-key'` and leaks the sandbox with no notice.

Alert on the leak:

```ts
import { SandboxReclaimFailedError } from '@tanstack/ai-sandbox'
import type { ReapResult } from '@tanstack/ai-sandbox'

export function alertOnLeakedSandboxes(
  result: ReapResult,
  alert: (message: string, detail: Record<string, unknown>) => void,
): void {
  if (result.outcomes['reclaim-failed'] === 0) return

  for (const run of result.runs) {
    if (run.outcome !== 'reclaim-failed') continue
    // The transcript is saved and the record is final. Only the teardown
    // failed. `status` and `exitCode` are reported as for `finalized`.
    const leakedKey =
      run.error instanceof SandboxReclaimFailedError
        ? run.error.sandboxKey
        : undefined

    alert('sandbox can still be billing', {
      runId: run.runId,
      status: run.status,
      sandboxKey: leakedKey,
      // Present only if the drive also took longer than `runBudgetMs`.
      budgetAnomaly: run.terminalizedAnyway !== undefined,
    })
  }
}
```

A custom `reclaim` must follow the same rule: reject when the sandbox was not torn down, resolve when there was nothing to tear down.

## Retention: three clocks

The reaper ends runs and destroys sandboxes. It does **not** delete your stored data. Each kind of data has its own owner:

- **The event log belongs to your durability backend.** The framework never deletes from it, because it does not own that storage. `memoryStream` evicts completed runs after a grace window. `durableStream` keeps data per its backend's policy. A custom adapter keeps data per yours. **30 days is a good default.** A user who opens a thread the next morning still gets an exact replay, and raw chunk logs do not grow forever.
- **Messages belong to the message store, and they must outlive events.** The transcript is the lasting record. The event log is a delivery detail. Once a run's events age out, the thread must still render.
- **Journals live in the sandbox.** `pruneJournals` bounds them, and they go away when `reclaimSandbox` destroys the sandbox.

Events can age out first. Messages must not.

## Client: render a thread whose events aged out

The usual case needs nothing. `useChat` with `persistence: true` loads the transcript on mount, and only then tails a run that still generates. If the run's event log is gone, the thread renders from messages.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Thread({ threadId }: { threadId: string }) {
  // On mount, this loads the transcript from the message store, then tails an
  // active run if there is one. An aged-out event log gives an empty tail, and
  // the transcript is already on screen.
  const { messages, sendMessage } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })

  return (
    <div>
      <p>{messages.length} messages</p>
      <button onClick={() => void sendMessage('Continue')}>Continue</button>
    </div>
  )
}
```

If you drive the rejoin yourself, add the fallback: join the run, and if it yields nothing, show the stored transcript, not an empty thread.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useEffect, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'

export function ThreadView({
  threadId,
  runId,
}: {
  threadId: string
  runId: string
}) {
  const [status, setStatus] = useState('joining')
  const [chunks, setChunks] = useState<Array<StreamChunk>>([])

  useEffect(() => {
    const controller = new AbortController()
    const connection = fetchServerSentEvents('/api/chat')

    async function join(): Promise<void> {
      let received = 0
      for await (const chunk of connection.joinRun(runId, controller.signal)) {
        received += 1
        setChunks((previous) => [...previous, chunk])
      }
      // Zero chunks from a known run means its log aged out or was pruned.
      // The transcript is still the source of truth.
      setStatus(received === 0 ? 'replaced-by-transcript' : 'joined')
    }

    void join().catch(() => setStatus('replaced-by-transcript'))
    return () => controller.abort()
  }, [runId])

  // Always render the transcript from the message store, and let joined
  // events add to it. Never hide the thread because the event log is gone.
  return (
    <p>
      {status}: {chunks.length} live events, thread {threadId}
    </p>
  )
}
```

The server has the same rule. A `GET` that only replays the log serves an empty stream for an aged-out run. Rebuild from messages first, then resume, as [Persistence Overview](../persistence/overview) shows.

## The limit: the instance store has no `list`

`SandboxInstanceStore` has `get`, `upsert`, and `delete`, and no enumeration. That is on purpose: a `list` forces every backend and the conformance suite to support enumeration for one possible caller.

The result: **a sandbox whose run record was deleted before any sweep saw it cannot be reached.** Nothing can name its key, so `reclaimSandbox` is never called for it. It lives until the provider's own idle reclamation takes it.

Two habits keep that rare:

- Delete run records only after their runs are final **and** their sandboxes are reclaimed.
- Set an idle timeout on the provider as the backstop.

## Cloudflare's stall watchdog is not a reaper

`createCloudflareSandboxAgent({ stallTimeoutMs })` marks a run log `failed` when the run goes quiet for too long. It does not do the reaper's job:

- It does not promise to kill the agent process.
- It never probes a journal.
- It never reclaims a sandbox.

So you still schedule `sweepDetachedRuns` on Cloudflare. See [the stall watchdog](./cloudflare#stall-watchdog).
