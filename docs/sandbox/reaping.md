---
title: Reaping & Retention (Advanced)
id: sandbox-reaping
order: 14
description: "Schedule the sweep that finalizes detached runs, prunes journals, and reclaims sandboxes."
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

If you wire `runs` + `durability` → **you must schedule** `reapDetachedRuns`. Nothing schedules it for you.

## Why it is mandatory

Without a sweep:

1. Detached delivery logs never close → attachers park forever.
2. `detachedRunTtlMs` is never read → abandoned agents burn tokens.
3. Sandboxes bill indefinitely (detach deliberately did not destroy them).

Also: `withPersistence` saves transcripts in `onFinish`. A run that finishes while detached never hits anyone's `onFinish`. The reaper drives it through middleware so the transcript lands (`'finalized'`). Unscheduled reaper = **silent loss of completed work**, not only cost.

## Wire the sweep once

```ts
import {
  probeRunExit,
  reapDetachedRuns,
  sandboxReclaimer,
} from '@tanstack/ai-sandbox'
import { durableStream } from '@tanstack/ai-durable-stream'
import type { RunRecord } from '@tanstack/ai'
import type { ReapResult, RunExitProbe } from '@tanstack/ai-sandbox'
import { locks } from './locks'
import { persistence } from './persistence'
import { instances, sandbox } from './sandbox'
import { driveRun } from './drive-run'

const { runs } = persistence.stores

const durableOptions = {
  server: 'https://streams.example.com',
  streamPrefix: 'agent-runs',
}

function durabilityFor(runId: string) {
  const url = new URL('https://reaper.internal/')
  url.searchParams.set('runId', runId)
  return durableStream(new Request(url), durableOptions)
}

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
    detachedRunTtlMs: 30 * 60 * 1000,
    maxRuns: 25,
    reclaim: sandboxReclaimer({
      provider: sandbox.provider,
      instances,
    }),
  })
}
```

`hasFinished` is injected: only your app can resolve `sandboxKey` → handle. Delivery log cannot answer finished-ness after detach (frozen while journal grows).

### Node timer

One in flight at a time:

```ts
import type { ReapResult } from '@tanstack/ai-sandbox'
import { sweepDetachedRuns } from './sweep'

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

Guard the route — it destroys sandboxes:

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

Register in `vercel.json` (e.g. `*/5 * * * *`).

### Cloudflare DO `alarm()`

Re-arm in `finally` or reaping stops forever. Not interchangeable with the package stall watchdog (log hygiene only — still schedule this sweep).

```ts
import { sweepDetachedRuns } from './sweep'

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
      await this.storage.setAlarm(Date.now() + 60_000)
    }
  }
}
```

## How `reapDetachedRuns` works

1. `listReclaimable({ now, ttlMs: 0 })` once — all detached runs.
2. Per run (cap `maxRuns`, default 25): classify expiry → else probe → claim → drive → reclaim.

Never rejects; per-run failures fold into `ReapResult`. Store without `listReclaimable` → `{ considered: 0 }`.

### Outcomes

| Outcome | Meaning |
| --- | --- |
| `finalized` | Sentinel seen; driven terminal; transcript saved |
| `expired` | Past TTL; cancel + drive; probe skipped |
| `producing` / `unknown` | Untouched (still working / probe failed) |
| `budget-exceeded` | Finalization anomaly (already terminal) |
| `not-claimed` | Another host drives — normal |
| `reclaim-failed` | Transcript saved; **sandbox still up** — not retryable by sweep; alert on this |
| `failed` | Threw; sweep continued |

### Never drive to discover finished-ness

**Cause:** `pipeToRunLog` always terminalizes + closes the log.  
**Effect:** mid-flight drive → permanent drop from `listReclaimable` + cost leak.  
**Fix:** learn finished-ness from journal via `probeRunExit` first; only then drive.

Never clear `detachedSince` in the reaper (resets TTL). Takeover clears it when a viewer returns.

## `probeRunExit`

Reads journal tail (~4 KB); answers `finished` / `producing` / `unknown`. Fail-safe: empty → `producing`.

## `pruneJournals`

Bounds journals inside a still-alive sandbox. Fails closed:

| Store says | Action |
| --- | --- |
| Terminal | delete |
| Non-terminal / unknown / lookup threw / bad name / age gate unavailable | keep |

```ts
import { pruneJournals } from '@tanstack/ai-sandbox'
import { persistence } from './persistence'
import { handleForSandbox } from './sandbox-handles'

const { runs } = persistence.stores

export async function sweepJournals(sandboxKey: string) {
  return pruneJournals({
    handle: await handleForSandbox(sandboxKey),
    runs,
  })
}
```

BusyBox `find` can exit 1 with empty stdout — treated as `unavailable`, not “delete all”.

## `reclaimSandbox` / `sandboxReclaimer`

Destroys via `RunRecord.sandboxKey`. Order:

1. Provider match first (multi-provider id clash).
2. `destroy` then `delete` instance; `delete` even if destroy throws → outcome `'destroy-failed'`.

`sandboxReclaimer` **rejects** on destroy-failed so outcome is `reclaim-failed`:

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
    const leakedKey =
      run.error instanceof SandboxReclaimFailedError
        ? run.error.sandboxKey
        : undefined

    alert('sandbox may still be billing', {
      runId: run.runId,
      status: run.status,
      sandboxKey: leakedKey,
      budgetAnomaly: run.terminalizedAnyway !== undefined,
    })
  }
}
```

## Size TTL and interval

- `detachedRunTtlMs` required number on `ReapOptions` only (no default; no string parse).
- Size from agent p99 duration (e.g. 30–60 min for 20 min tasks).
- Sweep interval **under** TTL (1 min sweep vs 30 min TTL).
- Prefer smaller interval over huge `maxRuns`.

## Retention (three clocks)

| Data | Owner | Notes |
| --- | --- | --- |
| Event log | Your `StreamDurability` backend | Framework never deletes; ~30 days reasonable |
| Messages | Message store | **Must outlive** event log |
| Journals | `pruneJournals` / sandbox destroy | Bounded inside sandbox |

### Client: aged-out log

`useChat({ persistence: true })` paints transcript first; empty tail is fine. If you rejoin yourself and get zero chunks, fall back to stored messages — never gate UI on the event log.

## Limitation: no instance-store `list`

Orphan sandbox with deleted run record is unreachable until provider idle reclaim. Mitigate: prune records only after reclaim; set provider idle timeout.

## See also

[Durable Runs](./durable-runs) · [Takeover](./takeover) · [Journal](./journal) · [Store Reference](../persistence/store-reference) · [Instance Durability](./durability)
