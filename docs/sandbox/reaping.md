---
title: Reaping & Retention (Advanced)
id: sandbox-reaping
order: 14
description: "Schedule the sweep that ends detached sandbox runs nobody came back for: it saves finished transcripts, cancels runs past their time limit, and destroys their sandboxes."
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

A [detached run](./takeover) keeps working after the user leaves. If the user never comes back, nothing ends that run:

- **The sandbox bills forever.** Detach exists so the sandbox is not destroyed, so something else must destroy it.
- **Clients wait forever.** A detached run's log stays open on purpose, so a client that joins waits for an event that never comes.
- **Finished work is lost.** `withPersistence` saves the transcript in `onFinish`, on the host that drives the run. A run that finishes while detached has no such host, so its transcript is never saved.

`reapDetachedRuns` ends these runs. It is a function, not a scheduler. **Your app must call it on a schedule.** Nothing does it for you, and nothing warns you when you forget. A timer inside a library does not work on serverless platforms, so the library ships none.

## Set up the sweep

This setup uses the `run-setup.ts` module from [Takeover & Detached Runs](./takeover#set-up-the-server).

1. Write the sweep once.

```ts
// sweep.ts
import {
  probeRunExit,
  reapDetachedRuns,
  sandboxReclaimer,
} from '@tanstack/ai-sandbox'
import type { RunRecord } from '@tanstack/ai'
import type { ReapResult, RunExitProbe } from '@tanstack/ai-sandbox'
import {
  durabilityFor,
  driveRun,
  instances,
  locks,
  runs,
  sandbox,
} from './run-setup'

// Did the agent exit? Read the journal tail in the run's sandbox.
// Anything this cannot answer must be 'unknown', never 'finished'.
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
    // Must resolve the same log the chat routes wrote.
    durability: durabilityFor,
    hasFinished,
    // The same drive the takeover route uses.
    drive: driveRun,
    now: Date.now(),
    // The only place this time limit is set. In milliseconds.
    detachedRunTtlMs: 30 * 60 * 1000,
    maxRuns: 25,
    reclaim: sandboxReclaimer({ provider: sandbox.provider, instances }),
  })
}
```

2. Call it on a schedule. Pick the one that fits your platform.

**Plain Node.** Keep one sweep in flight at a time. Two at once race for the same runs, and every second one reports `not-claimed`.

```ts
import { sweepDetachedRuns } from './sweep'

let inFlight = false

async function tick(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const result = await sweepDetachedRuns()
    console.log('reap', result.considered, result.outcomes)
    for (const run of result.runs) {
      if (
        run.outcome === 'failed' ||
        run.outcome === 'unknown' ||
        run.outcome === 'reclaim-failed'
      ) {
        console.warn('reap needs attention', run.runId, run.outcome, run.error)
      }
    }
  } finally {
    inFlight = false
  }
}

setInterval(() => void tick(), 60_000)
```

**Vercel Cron.** The route drives runs and destroys sandboxes, so guard it with `CRON_SECRET`.

```ts
// app/api/cron/reap/route.ts
import { sweepDetachedRuns } from '../../../../sweep'

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

```json
{
  "crons": [{ "path": "/api/cron/reap", "schedule": "*/5 * * * *" }]
}
```

**Cloudflare Durable Object `alarm()`.** A Durable Object runs one alarm at a time, so you get the "one sweep in flight" guard for free.

```ts
import { sweepDetachedRuns } from './sweep'

// The part of DurableObjectState this needs. In a real Worker, pass
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
      // Re-arm in `finally`. An alarm that throws without a new alarm stops
      // reaping forever.
      await this.storage.setAlarm(Date.now() + 60_000)
    }
  }
}
```

3. Leave a run detached and wait one sweep. Its sandbox is destroyed, and if the agent had finished, its transcript is in the message store.

> [!WARNING]
> Watch the `reclaim-failed` count. It means the transcript is saved but the sandbox destroy failed, so the sandbox can still bill. No later sweep retries it. That log line is the only notice you get. See [Reaping Internals](./reaping-advanced#reclaimsandbox-and-sandboxreclaimer).

## How it works

Each sweep:

1. Lists every detached run once, with `RunStore.listReclaimable`.
2. Takes up to `maxRuns` of them (25 by default) and handles them one at a time.
3. Never rejects. Every failure is logged and counted in the returned `ReapResult`.

For each run:

| The run is | The sweep | Outcome |
| --- | --- | --- |
| Past `detachedRunTtlMs` | Cancels it, drives it to a final status, destroys the sandbox. | `expired` |
| Finished (the journal has the exit line) | Drives it to a final status so `onFinish` saves the transcript, then destroys the sandbox. | `finalized` |
| Still working | Touches nothing. | `producing` |
| Not readable (no sandbox, a failed probe) | Touches nothing. | `unknown` |
| Claimed by another host | Touches nothing. A viewer probably came back. | `not-claimed` |

The sweep learns that a run finished from the journal in the sandbox, never by driving the run to see. It also never clears `detachedSince`, so the time limit keeps counting. The full outcome list, and why it works this way, is in [Reaping Internals](./reaping-advanced).

The reaper does not tidy journals inside a sandbox that stays alive. If you use `keepAlive` sandboxes, also schedule [`pruneJournals`](./reaping-advanced#prunejournals-bounding-the-journal-directory).

## Size the time limit and the interval

- **Set `detachedRunTtlMs` from your agent's p99 task time**, not from user patience. If an agent can run 20 minutes, 30 minutes is tight and an hour is safe. Too short cancels real work. Too long lets an abandoned run bill for that long.
- **Sweep well under the time limit.** The interval is how late an expired run can be, and how long a finished run waits for its transcript. Every minute against a 30-minute limit is cheap: one store query per minute. Every 30 minutes against a 30-minute limit can be an hour late.
- **Do not raise `maxRuns` for a backlog.** The cap keeps one call inside a Worker CPU budget or a Lambda timeout. Sweep more often instead.

## Go deeper

For every outcome, the journal probe, `pruneJournals`, sandbox reclaim, data retention, and the instance-store limit, see [Reaping Internals](./reaping-advanced).
