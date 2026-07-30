---
title: Reaping & Retention
id: sandbox-reaping
order: 14
description: "Schedule the sweep that finalizes detached runs, prunes journals, and reclaims sandboxes — and understand why a durable run that nothing reaps never lands its transcript."
keywords:
  - reapDetachedRuns
  - probeRunExit
  - pruneJournals
  - reclaimSandbox
  - sandboxReclaimer
  - SandboxReclaimFailedError
  - detachedRunTtlMs
  - retention
---

# Reaping & Retention

[Takeover & Detached Runs](./takeover) makes a disconnect survivable: the agent
keeps working, the sandbox stays up, and the run record remembers that nobody is
watching. That is only half a lifecycle. Something has to be the *end* of a run
that no viewer ever came back for.

That something is `reapDetachedRuns`, and it is a **function, not a scheduler**.

## Read this first: nothing schedules it for you

An application that wires `runs` + `durability` and never schedules
`reapDetachedRuns` is not running a reduced version of this feature. It is
running a broken one, in three distinct ways at once:

- **No detached run's delivery log is ever closed.** A detached run's log is
  deliberately left OPEN and un-terminalized so a takeover can continue it. If
  nothing ever terminalizes it, every client that attaches parks forever waiting
  for an event that will not arrive.
- **`detachedRunTtlMs` is enforced by nothing.** It is not a timer. It is a
  cutoff the sweep compares `detachedSince` against, and it exists only as an
  argument to `reapDetachedRuns` — there is no `withSandbox` equivalent. With no
  sweep, it is a number nobody ever reads and an abandoned agent burns tokens
  until something else kills it.
- **Sandboxes bill indefinitely.** Detach-on-disconnect exists precisely so the
  sandbox is *not* destroyed. Reclaiming it is the sweep's job.

There is no default cron, no background timer, and no warning at setup — a timer
inside a library is wrong on every serverless platform the sandbox packages
target. So treat scheduling as a hard requirement of wiring `durability`, on the
same footing as passing a real `LockStore`.

## Why the reaper is correctness, not just cost

The cost story is the obvious one. The correctness story is the reason
`'finalized'` exists as an outcome at all.

`withPersistence` saves a run's transcript in **`onFinish`**. A run that
completes while detached never reaches anyone's `onFinish`: the host that would
have run it is the host that left when the client disconnected. The agent
finished, its bytes are in the in-sandbox journal, the delivery log is frozen at
the last chunk that was actually delivered, and the message store has nothing.

Nothing recovers that on its own. A later takeover would — but a takeover only
happens if a user comes back, and the entire premise of a detached run is that
they might not. `reapDetachedRuns` is the actor that drives such a run through
`chat()`'s normal middleware path so `onFinish` fires and the transcript lands.
That is what `'finalized'` means, and it is why a reaper you never schedule
silently loses completed work rather than merely wasting money.

## `reapDetachedRuns`

```ts
import { reapDetachedRuns } from '@tanstack/ai-sandbox'
```

One sweep, in order:

1. Ask `RunStore.listReclaimable({ now, ttlMs: 0 })` — **once**. `ttlMs: 0` is
   *every* detached run, because that is the candidate set for finalization: a
   run that hit its sentinel one second after the viewer left has an unsaved
   transcript and must not wait out the TTL. Expiry is then classified
   in-process against `now - detachedRunTtlMs`, inclusively, so the store is not
   asked twice to compute a subset.
2. For each run in the batch (capped by `maxRuns`, default `25`): classify
   expiry first, otherwise probe, and only then claim, quiesce, drive, and
   reclaim.

`listReclaimable` is optional on `RunStore`. A backend that omits it answers
`{ considered: 0 }` and one log line — it cannot be reaped at all.

The function **never rejects**. It runs from a cron, an `alarm()`, or a
`waitUntil`, where nobody is there to catch it, so every per-run failure is
logged and folded into the returned `ReapResult`.

### Outcomes

`ReapResult.runs` is one `ReapRunEntry` per run, and `ReapResult.outcomes` counts
them by `ReapRunOutcome`:

| Outcome | Meaning |
| --- | --- |
| `finalized` | The probe saw the exit sentinel, the run was driven to terminal, the transcript is saved. The happy path. |
| `expired` | Past `detachedRunTtlMs`. Cancelled first (so the teardown is an explicit cancel that destroys the sandbox), then driven to terminal. The probe is skipped — the outcome is terminal either way. Reported even when `runBudgetMs` is what ended the drive: on this path that is the mechanism, not an anomaly. The run's `status` tells the two apart — an agent that had already finished replays to `completed`, one still producing when the budget fired is `aborted`. |
| `producing` | Still working. `pipeToRunLog` was never entered: nothing appended, no record written, `close()` not called, `detachedSince` untouched. |
| `unknown` | The probe could not answer. Left exactly as untouched as `producing`, but an operator should see it. |
| `budget-exceeded` | Anomaly, and **finalization only**. A run the journal already said was finished outran `runBudgetMs`. The record *is* terminal and the log *is* closed, so this is a diagnostic, not a leak. An expired run that outran its budget reports `expired` instead. The entry also carries `terminalizedAnyway`, which is set **if and only if** this anomaly happened — so it survives even when a subsequent failed reclaim overwrites the outcome. |
| `not-claimed` | Another host holds the claim, or took it mid-drive. Normal — a real viewer attaching mid-sweep is exactly this. |
| `reclaim-failed` | The run reached terminal and its transcript **is** saved — only `ReapOptions.reclaim` threw, so the sandbox is still up. **Not retryable by the sweep**: the record is terminal by now, so it has already left `listReclaimable` for good, and nothing will sweep it again. This is the outcome that says the cost leak the reaper exists to stop is still leaking; the entry's `error` is the only notice you get. The shipped `sandboxReclaimer` **rejects** on its `destroy-failed` arm precisely so this is reachable without a custom `reclaim`. Overwrites `budget-exceeded` when both happened — the leak is what needs acting on, and `terminalizedAnyway` preserves the other half. |
| `failed` | Something threw. Logged, counted, and the sweep continued. |

There is deliberately no "still running" outcome distinct from `producing`, and
no outcome meaning "we drove it and it turned out not to be finished" — see
below for why that state is unreachable by construction.

### It never drives a run to find out whether it finished

This is the one rule that shapes the whole module, and it is worth understanding
before you wire anything, because the obvious alternative is worse than it looks.

The tempting design is: hand the run to `pipeToRunLog` under a short budget and
see whether it terminalizes. That does not work, because `pipeToRunLog` is total
by construction — it **always** writes a terminal status and **always** calls
`durability.close()`, on every path. Against a run that has *not* finished, all
three producer shapes are destructive:

| The producer's reaction to the budget signal | Stored status | `close()` |
| --- | --- | --- |
| Ignores it and keeps producing | `aborted` | called |
| Returns on abort (the realistic `drive`) | `aborted` | called |
| Throws an `AbortError` | `failed` | called |

The middle row used to read `completed`, and that was the fatal one: a
signal-aware producer — the shape a *well-behaved* `drive` actually has — exits
its loop normally, and `pipeToRunLog` checked its abort signal only per chunk, so
a healthy mid-flight run was recorded as `'completed'` with a `finishedAt`. That
gap is fixed; `pipeToRunLog` re-checks the signal after the loop, so an aborted
drive is never recorded as completed.

The rule is unchanged, though, because the status was never the whole harm: every
row above writes a terminal record and closes a log that was deliberately left
open, ending every attached client's stream — and a terminal record drops out of
`listReclaimable` **forever**, so TTL expiry can never reclaim that run's sandbox.
A cost leak with no recovery path.

So finished-ness is learned **out of band**, from the in-sandbox journal, and
`pipeToRunLog` is entered only for a run already known to have finished or one
whose TTL has expired (terminal either way). On the finalization path `runBudgetMs`
therefore degrades from a load-bearing mechanism into a safety net whose expiry is
a genuine anomaly. On the expiry path it stays load-bearing: nothing polls the
cancel the reaper records, so the budget is what stops an expired run whose agent
is still producing.

The sweep also **never clears `detachedSince`**. That field is what the reaper
selects on and the evidence its TTL accounting used. Clearing it would reset the
TTL on every sweep and a detached run would never expire. (The takeover path
clears it, because there a real viewer genuinely stopped the clock.)

## `probeRunExit`, and why `hasFinished` is injected

`ReapOptions.hasFinished` is a required option you supply. `probeRunExit` is the
shipped implementation:

```ts
import { probeRunExit } from '@tanstack/ai-sandbox'
```

It reads the **tail** of the run's journal (4 KB by default,
`DEFAULT_EXIT_PROBE_BYTES`) and answers whether the `{"__exit":N}` sentinel is
there. Read-only: no append, no record write, no `close()`. Its three-armed
answer — `finished` / `producing` / `unknown` — is not a boolean on purpose, so a
provider `exec` that rejected can never be mistaken for "the agent exited". Any
failure answers `unknown`; an empty tail answers `producing`, the fail-safe
direction (a journal that does not exist yet is indistinguishable from one with
no sentinel, and both mean *do not touch this run*).

It is injected rather than resolved inside the reaper for two reasons, both
structural:

- **The delivery log cannot answer the question.** After a detach nothing appends
  to it — the host that would have appended is the host that left — so the log is
  frozen at the last delivered chunk while the *journal* keeps growing. The log
  can only ever say "no news".
- **Only your application can resolve a `SandboxHandle`.**
  `SandboxInstanceStore` is `get` / `upsert` / `delete` with no `list` (see
  [the named limitation](#the-limitation-there-is-no-instance-store-list)), and
  mapping a `RunRecord.sandboxKey` to a live handle is application knowledge.

`ReapOptions.reclaim` is injected for the same reason, and
`sandboxReclaimer` is its ready-made implementation.

## Server: wire the sweep once

Everything the sweep needs is what your `POST` route already has, plus a way to
resolve a sandbox handle from a key. Put it in one module and let each schedule
call it.

```ts
import {
  probeRunExit,
  reapDetachedRuns,
  sandboxReclaimer,
} from '@tanstack/ai-sandbox'
import { durableStream } from '@tanstack/ai-durable-stream'
import type { RunRecord } from '@tanstack/ai'
import type { ReapResult, RunExitProbe } from '@tanstack/ai-sandbox'
// Your distributed LockStore, the same one `withSandbox` gets.
import { locks } from './locks'
// Your persistence — the SAME RunStore the chat routes use.
import { persistence } from './persistence'
// Your `defineSandbox(...)` result and the `SandboxInstanceStore` you passed to
// `withSandbox(sandbox, { instances })`.
import { instances, sandbox } from './sandbox'
// The same `drive` the attach route passes to `sandboxRunDriver` — a function of
// `{ runId, threadId, signal }` that runs `chat()` with `durability.attach: true`.
// See ./takeover, "Server: take the run over".
import { driveRun } from './drive-run'

const { runs } = persistence.stores

// The per-run log factory, and it MUST resolve the same log the producing route
// wrote — otherwise the sweep terminalizes an empty log while the real one stays
// open. A cron has no incoming request, so synthesize one naming the run.
//
// `?runId` is the form to use here: `durableStream` resolves a run from the
// `X-Run-Id` header first, then `?runId` (the same precedence core's own
// `memoryStream` uses), but a synthesized `Request` has no reason to carry a
// header when a query param is just as easy to set — either addresses the
// same `agent-runs/<runId>` the chat routes' `durableStream(request,
// durableOptions)` addresses. No resume offset is set, because the reaper is
// a producer, not a replaying client.
//
// The same backend and options the chat routes use — see ../resumable-streams/
// advanced for the full option set. `durableStream` talks to it over HTTP, so a
// synthesized request works exactly like a real one: the run's state lives in
// the backend, not in this process.
const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'agent-runs',
}

function durabilityFor(runId: string) {
  const url = new URL('https://reaper.internal/')
  url.searchParams.set('runId', runId)
  return durableStream(new Request(url), durableOptions)
}

// Only the application can map a recorded `sandboxKey` back to a live handle:
// the instance store answers `get(key)` but never enumerates, and resolving the
// provider sandbox id it holds is your provider's `resume`. Anything this cannot
// answer must be `unknown`, never `finished`.
async function hasFinished(record: RunRecord): Promise<RunExitProbe> {
  if (record.sandboxKey === undefined) return { state: 'unknown' }
  try {
    const instance = await instances.get(record.sandboxKey)
    if (instance === null) return { state: 'unknown' }
    const handle = await sandbox.provider.resume({
      id: instance.providerSandboxId,
    })
    if (handle === null) return { state: 'unknown' }
    return await probeRunExit({ handle, runId: record.runId })
  } catch (error) {
    return { state: 'unknown', error }
  }
}

export function sweepDetachedRuns(): Promise<ReapResult> {
  return reapDetachedRuns({
    runs,
    locks,
    durability: durabilityFor,
    hasFinished,
    drive: driveRun,
    now: Date.now(),
    // The only place this TTL is configured — there is no `withSandbox`
    // equivalent. In milliseconds.
    detachedRunTtlMs: 30 * 60 * 1000,
    // Sequential by design — each run costs a lock, a provider round-trip, and a
    // full replay. Keep the batch inside your platform's invocation budget.
    maxRuns: 25,
    reclaim: sandboxReclaimer({
      provider: sandbox.provider,
      instances,
    }),
  })
}
```

`reapDetachedRuns` resolves rather than rejects, so log the summary and let the
schedule keep its cadence:

```ts
import type { ReapResult } from '@tanstack/ai-sandbox'
import { sweepDetachedRuns } from './sweep'

// Plain Node, no platform cron. One in flight at a time: a sweep that overruns
// its interval must not be started twice, or two invocations race for the same
// claims and every second one reports `not-claimed`.
let inFlight = false

async function tick(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const result: ReapResult = await sweepDetachedRuns()
    console.log('reap', result.considered, result.outcomes)
    for (const run of result.runs) {
      if (run.outcome === 'failed' || run.outcome === 'unknown') {
        console.warn('reap needs attention', run.runId, run.outcome, run.error)
      }
    }
  } finally {
    inFlight = false
  }
}

setInterval(() => void tick(), 60_000)
```

### Vercel Cron

A cron route is a plain `GET`. Guard it — it drives runs and destroys sandboxes,
so it must not be publicly callable.

```ts
import { sweepDetachedRuns } from './sweep'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (
    secret === undefined ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await sweepDetachedRuns()
  return Response.json({
    considered: result.considered,
    probed: result.probed,
    outcomes: result.outcomes,
  })
}
```

Register it in `vercel.json` with a `path` and a `schedule` (`*/5 * * * *` is a
reasonable start — see [sizing](#sizing-detachedrunttl-and-the-sweep-interval)).

### Cloudflare: a Durable Object `alarm()`

A DO alarm is the natural scheduler on Workers: it is single-instance, so the
"one sweep in flight" guard is free, and it re-arms itself.

```ts
import { sweepDetachedRuns } from './sweep'

// The slice of `DurableObjectState` this needs. In a real Worker this is
// `state.storage` from your Workers types.
interface AlarmStorage {
  setAlarm: (scheduledTime: number) => Promise<void>
}

export class RunReaper {
  constructor(private readonly storage: AlarmStorage) {}

  async alarm(): Promise<void> {
    try {
      const result = await sweepDetachedRuns()
      console.log('reap', result.considered, result.outcomes)
    } finally {
      // Re-arm in `finally`. An alarm that throws without rescheduling stops
      // reaping forever, which is exactly the failure mode this page is about.
      await this.storage.setAlarm(Date.now() + 60_000)
    }
  }
}
```

## `pruneJournals`: bounding the journal directory

The reaper terminalizes runs and reclaims sandboxes. It does not tidy the
journal directory *inside* a sandbox that is still alive — a `keepAlive` sandbox
serving many turns accumulates journals for every run whose exit sentinel nobody
was there to observe.

```ts
import { pruneJournals } from '@tanstack/ai-sandbox'
import { persistence } from './persistence'
import { handleForSandbox } from './sandbox-handles'

const { runs } = persistence.stores

export async function sweepJournals(sandboxKey: string) {
  const result = await pruneJournals({
    handle: await handleForSandbox(sandboxKey),
    // Only `get` is used: the sweep asks about the runIds it found on disk and
    // never enumerates the store, so no optional `RunStore` method is needed.
    runs,
  })
  if (result.ageGate === 'unavailable') {
    console.warn('journal sweep could not age-gate; kept every orphan')
  }
  return result
}
```

**It fails closed everywhere.** The journal is the only copy of the bytes a
successor host needs to replay a run a dead host abandoned, so the decision
procedure is not "delete unless there is a reason to keep" — it is the opposite,
and every arm that is not a *proven*-safe deletion keeps:

| What the store says | Action | Why |
| --- | --- | --- |
| Terminal (`isTerminalRunStatus`) | **delete** | The delivery log, not the journal, is the record a late takeover aligns against. A non-zero exit is terminal too. |
| Non-terminal — including `'interrupted'` | keep | An interrupt is a human-in-the-loop *pause*; interrupt-resume continues from that journal. |
| Nothing (unknown runId) | keep until `orphanTtlMs` | The reader **creates** the journal before the record exists, so "unknown runId" is the normal state of a run that started moments ago. |
| The lookup threw | keep | An unanswered question is not a licence to delete. |
| The filename did not decode | keep | A truncated name decodes to a plausible but *wrong* runId, so asking the store would answer about some other — possibly live — run. |
| The mtime age gate is unavailable | keep every age-gated entry | Cannot age-gate ⇒ cannot expire. `unavailable` is a first-class result, never an empty listing. |

That last row is the trap the module exists to not fall into. BusyBox `find`
prints its "unrecognized option" diagnostic to stderr and exits **1 with empty
stdout**; code that reads that as "no file is newer than the cutoff" and
concludes "therefore every file is old" deletes the whole directory, live runs
included. The mtime listing carries a self-witness line and reports
`unavailable` rather than `[]`, and `pruneJournals` honors that as "I keep".

Deletions per sweep are capped by `maxDeletes` (default `DEFAULT_MAX_DELETES`,
200); the remainder is reported as kept with reason `max-deletes` and picked up
next time. `orphanTtlMs` defaults to `DEFAULT_ORPHAN_TTL_MS` (one hour) —
three orders of magnitude of headroom on the create-then-record race, because the
cost of too long is bytes and the cost of too short is a destroyed live run.
`pruneJournals` never rejects either; failures land in
`PruneJournalsResult.failures`.

## `reclaimSandbox` and `sandboxReclaimer`

```ts
import { reclaimSandbox, sandboxReclaimer } from '@tanstack/ai-sandbox'
```

`reclaimSandbox(record, { provider, instances })` destroys the sandbox a terminal
run was bound to, using `RunRecord.sandboxKey` — recorded by the detach path at
the moment it still knew the compound key, because the reaper has none of the
inputs (`threadId`, workspace hash, tenant, reuse strategy) needed to re-derive
it. It answers `'destroyed'`, `'destroy-failed'`, `'no-sandbox-key'`,
`'not-found'`, or `'provider-mismatch'`.

Two orderings are load-bearing:

- **The provider check comes first**, before either `destroy` or `delete`. A
  multi-provider app would otherwise hand a Docker container id to Daytona's
  `destroy`, which at best errors and at worst matches an unrelated sandbox in
  the other provider's id namespace. A mismatch therefore touches **nothing**,
  including the instance record, which the *right* provider still needs.
- **`destroy` before `delete`, and `delete` regardless of whether `destroy`
  threw.** The provider sandbox may already be gone (idle-reclaimed, region
  wiped, container pruned). Keeping an instance record that points at nothing
  guarantees a failed `resume` on the thread's next turn — a broken user
  experience — whereas an orphaned provider sandbox is a bounded cost the
  provider itself reclaims. `delete` is therefore unconditional, but the
  *outcome* must not claim success when `destroy` threw: `'destroy-failed'` is
  reported instead of `'destroyed'`, because the instance record is gone
  either way and an operator needs to tell "torn down cleanly" apart from
  "possibly still billing, and now unreachable from here since
  `SandboxInstanceStore` has no `list`". `sandboxReclaimer` logs
  `'destroy-failed'` above debug level for exactly that reason — every other
  outcome is bookkeeping an operator never needs to see.

`sandboxReclaimer(options)` is the same thing adapted to `ReapOptions.reclaim`:
it logs the outcome and resolves — **except on `'destroy-failed'`, where it
rejects** with a `SandboxReclaimFailedError`. The reaper calls it **only** once
the record actually reached a terminal status, and with the *originally listed*
record rather than the one the drive returned — a failed terminal `update`
yields a locally rebuilt record with no `sandboxKey`, which would answer
`'no-sandbox-key'` and leak the sandbox silently on exactly the path where
something already went wrong.

That rejection is deliberate, and it is what makes the `reclaim-failed` outcome
reachable at all. `ReapOptions.reclaim` is `(record) => Promise<void>`, so a
rejection is the sweep's only channel for "the sandbox was NOT reclaimed":

Wire the reclaimer as shown above (`reclaim: sandboxReclaimer({ provider,
instances })`), then inspect the summary the sweep hands back:

```ts
import { SandboxReclaimFailedError } from '@tanstack/ai-sandbox'
import type { ReapResult } from '@tanstack/ai-sandbox'

export function alertOnLeakedSandboxes(
  result: ReapResult,
  alert: (message: string, detail: Record<string, unknown>) => void,
): void {
  // Watch this counter — it is the leak alarm.
  if (result.outcomes['reclaim-failed'] === 0) return

  for (const run of result.runs) {
    if (run.outcome !== 'reclaim-failed') continue
    // The transcript IS saved and the record IS terminal; only the teardown
    // failed. `status`/`exitCode` are reported exactly as `finalized` reports
    // them, which is what distinguishes this from a `failed` sweep.
    const leakedKey =
      run.error instanceof SandboxReclaimFailedError
        ? run.error.sandboxKey
        : undefined

    alert('sandbox may still be billing', {
      runId: run.runId,
      status: run.status,
      sandboxKey: leakedKey,
      // Present ONLY if the drive also outran `runBudgetMs`. `reclaim-failed`
      // overwrites the `budget-exceeded` outcome, so this field is what keeps
      // that second diagnostic on the entry.
      budgetAnomaly: run.terminalizedAnyway !== undefined,
    })
  }
}
```

A `reclaim-failed` run has already left `listReclaimable` for good, so no later
sweep retries it — that entry is the only notice you will get. A custom
`reclaim` should follow the same convention: reject when the sandbox was not
torn down, resolve when there was nothing to tear down.

## Sizing `detachedRunTtlMs` and the sweep interval

`detachedRunTtlMs` is a wall-clock cap, in milliseconds, on a *running agent
with nobody watching*. There is no default and no string parsing: it is a
required, plain number on `ReapOptions`, and deliberately lives only there —
`withSandbox` cannot enforce a TTL itself, since `reapDetachedRuns` runs from a
cron with no chat request in flight and has no capability bus to read it
from. Passing it directly to the sweep is what keeps it a single source of
truth instead of two settings that could silently disagree.

Size it from your agent's honest p99 task duration, not from user patience: too
short and you cancel real work a user was going to come back to; too long and an
abandoned run bills for that long. If a coding agent legitimately runs 20
minutes, 30 minutes (`30 * 60 * 1000`) is tight and an hour is defensible.

Then keep the sweep interval well **under** the TTL. The interval bounds how
long *past* the TTL an expired run survives, and it also bounds how long a run
that finished while detached waits before its transcript lands. A one-minute
alarm against a 30-minute TTL costs one cheap store query per minute and makes
both windows negligible. Sweeping every 30 minutes against a 30-minute TTL means
an expiry can be an hour late.

`maxRuns` (default 25) and the sequential per-run loop exist so one invocation
cannot outrun a Worker's CPU budget or a Lambda timeout and be killed mid-drive.
If a backlog exceeds the batch, the next tick takes the next batch — reduce the
interval rather than raising the cap.

## Retention: three clocks, and only one of them is ours

The reaper closes runs and reclaims sandboxes. It does **not** garbage-collect
your stored data, and the split is deliberate:

- **Event-log retention is your durability backend's job**, inside whatever
  `StreamDurability` you wired. The framework never deletes from it, because it
  does not own the storage — `memoryStream` evicts completed runs after a grace
  window, `durableStream` retains per its backend's own policy, and a custom
  adapter retains per yours. **30 days is a reasonable default**: long enough
  that a user who reopens a thread the next morning still gets an exact replay of
  the run, short enough that a chatty deployment does not accumulate raw chunk
  logs forever.
- **Message retention is the message store's job**, and it must **outlive** event
  retention. The transcript is the durable artifact; the event log is a delivery
  detail. Once a run's events age out, the thread must still render — see the
  client half below.
- **Journals are bounded inside the sandbox** by `pruneJournals`, and vanish with
  the sandbox when `reclaimSandbox` destroys it.

The ordering is what matters: events may age out first, messages must not.

## Client: tolerate an aged-out event log

The usual case needs nothing. `useChat` with `persistence: true` fetches the
transcript on mount and only then tails whatever run is still generating, so a
run whose event log is gone simply paints from messages.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Thread({ threadId }: { threadId: string }) {
  // On mount this GETs the transcript from the message store, then tails an
  // `activeRun` if `reconstructChat` reports one. An aged-out event log means
  // the tail yields nothing — the transcript is already painted, so the thread
  // still renders correctly. This is why message retention must outlive event
  // retention.
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

If you drive the rejoin yourself, make the fallback explicit: join the run, and
if it yields nothing, fall back to the stored transcript rather than showing an
empty thread.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useEffect, useState } from 'react'
import type { StreamChunk } from '@tanstack/ai'

export function ThreadView({ threadId, runId }: {
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
      // Zero chunks from a run the server knew about means its delivery log
      // aged out (or was pruned). The transcript is still authoritative.
      if (received === 0) setStatus('replaced-by-transcript')
      else setStatus('joined')
    }

    void join().catch(() => setStatus('replaced-by-transcript'))
    return () => controller.abort()
  }, [runId])

  // Reconstructed from the message store — always render this, and let the
  // joined events refine it. Never gate the thread on the event log existing.
  return (
    <div>
      <p>
        {status}: {chunks.length} live events, thread {threadId}
      </p>
    </div>
  )
}
```

The same rule applies server-side: a `GET` that only replays the log will serve
an empty stream for an aged-out run. Route reconstruct-from-messages first and
resume second, as [Persistence Overview](../persistence/overview) shows.

## The limitation: there is no instance-store `list`

`SandboxInstanceStore` is `get` / `upsert` / `delete`, with no enumeration, and
that is a deliberate refusal: adding `list` would force every backend and the
conformance suite to grow an enumeration for one hypothetical caller.

The consequence is real and documented rather than hidden. **A sandbox whose run
record was deleted before any sweep saw it is unreachable.** Nothing can name its
key, so `reclaimSandbox` can never be called for it, and it survives until the
provider's own idle reclamation takes it. Two things keep that rare: prune run
records only after their runs are terminal *and* their sandboxes reclaimed, and
set a provider-side idle timeout as the backstop.

## See also

- [Takeover & Detached Runs](./takeover): how a run becomes detached in the first
  place, `sandboxRunDriver`, and the single-writer fencing the sweep reuses
- [The Run Journal](./journal): the journal `probeRunExit` reads and
  `pruneJournals` bounds
- [Build Your Own Adapter](../persistence/build-your-own-adapter):
  `listReclaimable`, and the run fields a reapable backend must round-trip
- [Sandbox Instance Durability](./durability): the instance store
  `reclaimSandbox` deletes from
