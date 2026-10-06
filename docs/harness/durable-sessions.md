---
title: Durable sessions
id: harness-durable-sessions
order: 4
description: "Keep a harness turn alive through a crash or a deploy. The next host continues it from the session log, and a turn that keeps failing stops after a limit."
keywords:
  - tanstack ai
  - harness
  - durability
  - resume
  - session log
  - retries
---

A long agent turn can outlive the process that started it: a deploy restarts the server, or the machine crashes in the middle of a tool call. Give the host a session log, and the next host that opens the thread continues the turn. A turn that crashes the host every time stops after a limit.

## Give the host a session log

A durable host takes two stores:

- `log`: one append-only log per thread. It keeps the events, the transcript, the inputs, and the tool steps.
- `runs` or `leases`: a lease tells the next host that the last one stopped. `runs` keeps run records with leases. `leases` is a store that you wire to your own lease system. See [Use your own leases](#use-your-own-leases).

```ts group=harness-durable
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'

// Swap in your own stores. Memory stores do not survive a restart.
const { runs, metadata } = memoryPersistence().stores

const host = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), runs, metadata } },
})
```

`metadata` is optional. With it, the host keeps a fold checkpoint of each log, so a long thread opens faster. It also keeps the interrupts that the last turn waits on, so `session.resolve` continues that turn on the next host. To store the log in your database, implement the [`LogStore` contract](../persistence/store-reference#logstore).

## Limit attempts and time

Each run of an input is one attempt: the first run, and each run after a crash. Set the limits on the harness:

```ts group=harness-durable
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  durability: { maxAttempts: 5, timeoutMs: 30 * 60_000 },
})
```

- `maxAttempts`: the total attempts for one input. The default is 10.
- `timeoutMs`: the time from the first run until the input fails. A retry does not reset it. The default is no timeout, because some agent turns run for hours.

A turn that passes its time limit is stopped. It ends with the error code `timeout`.

## What happens after a crash

When a host opens the thread and finds a turn whose lease expired, it checks these, in order:

1. An abort was asked for the turn: the input ends `aborted`. The model is not called.
2. No attempt is left: the input ends `failed`, with the error code `attempts_exhausted`.
3. The time limit passed: the input ends `failed`, with the error code `timeout`.
4. The log already has the final answer: the input ends `completed`. The model is not called again.
5. Else the turn runs again as the next attempt, and clients get a `harness.operation.resumed` event.

An input that was stored but never ran, runs now. See [Send inputs safely](./inputs) to read how an input ended.

A background agent that you started with `resume: true` runs again on the next host. See [Keep a background agent going after a crash](./subagents#keep-a-background-agent-going-after-a-crash). For any other background agent, when its lease expired, the next host:

1. Ends the run `failed`, with the message `The host stopped during this agent run.`
2. Adds a note about the failure to the transcript.
3. Starts a new turn, if you started the agent with `{ wake: true }`.

`durability.recover` does not run for background agents.

## Resume pending work after a deploy

A host recovers a thread when something opens it. After a deploy, nobody opens a thread whose user closed the tab, so its queued turn or background agent waits. Give the host `stores.workClaims`, then call `host.resumePending` to find that work and run it.

Add `workClaims` to the stores of every replica:

```ts group=harness-durable
const claimStores = memoryPersistence().stores

const sweeper = createHarnessHost({
  persistence: {
    stores: {
      log: memoryLogStore(),
      runs: claimStores.runs,
      metadata: claimStores.metadata,
      workClaims: claimStores.workClaims,
    },
  },
})
```

Call `resumePending` once when the server starts:

```ts group=harness-durable
const opened = await sweeper.resumePending({ harnesses: [assistant] })
console.log(`Resumed ${opened.length} threads`, opened)
```

Call it again on a timer, from a cron route or a Durable Object alarm. Then a replica that stops while the others keep running does not leave work behind:

```ts group=harness-durable
export async function GET() {
  const resumed = await sweeper.resumePending({
    harnesses: [assistant],
    limit: 50,
  })
  return Response.json({ resumed })
}
```

`memoryPersistence()` includes a memory `workClaims` store. It does not survive a restart. To keep claims in your database, implement the [`WorkClaimStore` contract](../persistence/store-reference#workclaimstore). This is server-side only. Clients do nothing for it.

### When a thread holds a claim

The session claims its thread for its host when the thread gets work:

- An input that leaves work: `prompt`, `steer`, `followUp`, `resolve`, `reset`, or an `agent` input.
- A queued turn that the session recovers.
- A background agent run.

The session renews the claim on the lease timer: every `lease.renewMs`, for `lease.ttlMs`. See [One host drives a thread](#one-host-drives-a-thread) to set them.

The session gives the claim back when the thread is idle: no queued or running turn, no waiting steer, and no running agent. A thread that waits for a human (an approval or a sign-in) is idle, so a sweep never takes it.

### What a sweep does

`host.resumePending({ harnesses, close, limit })`:

1. Reads the expired claims, oldest first. It reads at most `limit` claims. The default is 100.
2. Skips a thread whose harness is not in `harnesses`. That claim stays listed and counts against `limit`, so pass every harness that the host serves.
3. Claims each thread with compare-and-set. If two hosts sweep at the same time, each thread goes to one of them.
4. Opens the thread. The recovery steps in [What happens after a crash](#what-happens-after-a-crash) run its pending work.

It resolves with the threads that it opened, as `{ threadId, harness }` entries. Without `stores.workClaims`, it throws.

The `close` option sets what happens to a session that the sweep opened:

- `'whenIdle'` (default): the session closes when its work ends. If the app opened the same thread too, the session stays open.
- `'never'`: the session stays open, like any session that you open.

### Watch for claim warnings

A failed claim or release write does not fail the work. The session publishes a `harness.plugin.warning` custom event with `plugin: 'harness:work-claims'` and the error message. Without that claim, a sweep cannot find the work after a crash. Watch for this event to find these threads.

A known limit: if this host already has the thread open, the sweep claims it, but the session does not recover again. The claim expires, and a later sweep finds the thread.

## Retry model errors

A model call can fail for a short time: a 429, a 5xx, an overloaded provider, or a network error. Add `retryTransientErrors()` to run the model again in the same turn, after a backoff:

```ts group=harness-durable
import { retryTransientErrors } from '@tanstack/ai-harness'

const resilient = defineHarness({
  name: 'acme/resilient',
  adapter: openaiText('gpt-5.6'),
  turn: { onModelError: retryTransientErrors() },
})
```

Other errors fail the turn. To set the limits, see [Control how a turn ends](./turn-control#retry-model-errors).

## Decide recovery yourself

The steps above are the default. To change them for one input, add `durability.recover`. It runs for each input that a crashed host left. It gets `{ session, input, messages, decision }`:

- `input`: the input, with `inputId`, `attempt`, `timeoutAt`, and `abortRequested`.
- `messages`: the transcript from the log.
- `decision`: what the harness does by default. It is one of the 5 steps above, or `run` for an input that never ran.

Return `undefined` to keep the decision. Or return one of these:

- `{ action: 'run' }`: run the input now.
- `{ action: 'settle', outcome, error? }`: end the input as `'completed'`, `'failed'`, or `'aborted'`. Without a model call.

This example fails an input with your own error code after 2 runs:

```ts group=harness-durable
const guarded = defineHarness({
  name: 'acme/guarded',
  adapter: openaiText('gpt-5.6'),
  durability: {
    recover: ({ input, decision }) => {
      if (decision.action === 'run' && input.attempt >= 2) {
        return {
          action: 'settle',
          outcome: 'failed',
          error: { message: 'This request crashed the host twice.', code: 'poison_input' },
        }
      }
      return undefined
    },
  },
})
```

## Mark tools that are safe to run again

A crash can stop a run after a tool started but before its result was stored. Tell the harness what to do with `replay`:

```ts group=harness-durable
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const lookup = toolDefinition({
  name: 'lookup_order',
  description: 'Read an order',
  inputSchema: z.object({ id: z.string() }),
  replay: 'safe',
}).server(async ({ id }) => ({ id, status: 'shipped' }))
```

- `replay: 'safe'`: the tool runs again. Use it for reads and other idempotent calls.
- `replay: 'never'` (default): the model gets a tool error. Nobody knows if the tool ran, so the model checks before it tries again.

A tool that finished before the crash keeps its result. It does not run again. For a tool with side effects, such as a payment, see [Run side effects once](./durable-tools).

## One host drives a thread

Only one host writes to the log of a thread at a time. A host that only reads (for example `GET /events` on a second server) follows the log and writes nothing. When a second host writes to the thread, the first host's session stops, and its running turn fails with a clear error. Open the thread again to continue on that host.

The lease decides when a stopped host counts as gone. Change its timing on the host:

```ts group=harness-durable
const leasedHost = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), runs } },
  lease: { ttlMs: 60_000, renewMs: 20_000 },
})
```

## Use your own leases

You may already have leases in a job queue or a submission table. Give the host a `LeaseStore` as `stores.leases`, and it uses your system to find a crashed host. Each call gets the `threadId`, `inputId`, `operationId`, and `attempt` of one turn attempt:

- `acquire`: the host takes the lease when the attempt starts. It also gets `ownerId` and `expiresAt`.
- `renew`: the host extends the lease while the attempt runs. It also gets `ownerId` and `expiresAt`.
- `release`: the host gives the lease back when the attempt ends. It also gets `ownerId` and `expiresAt`.
- `isAlive`: after a crash, the host asks if another host still runs the attempt.

A host with `leases` does not need `runs`. If you give both, `leases` decides. The `lease` option sets the timing, as in the section above.

```ts group=harness-durable
import type { LeaseStore, TurnLease, TurnLeaseKey } from '@tanstack/ai-persistence'

const held = new Map<string, TurnLease>()
const keyOf = (k: TurnLeaseKey) =>
  `${k.threadId}:${k.inputId}:${k.operationId}:${k.attempt}`

// Swap the Map for your queue or table.
const leases: LeaseStore = {
  acquire: async (lease) => {
    held.set(keyOf(lease), lease)
  },
  renew: async (lease) => {
    held.set(keyOf(lease), lease)
  },
  release: async (lease) => {
    held.delete(keyOf(lease))
  },
  isAlive: async (key) => (held.get(keyOf(key))?.expiresAt ?? 0) > Date.now(),
}

const leasedByYou = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), leases } },
})
```

For the full contract, see [`LeaseStore`](../persistence/store-reference#leasestore).

## What you have now

- Turns that continue after a crash or a deploy, from the session log, also on threads that nobody opens again.
- A turn that stops after `maxAttempts` or `timeoutMs`, with a clear error code.
- Tools that either run again safely or tell the model to check first.
- A turn that retries a short model error by itself.
- Your own rule for how a crashed input recovers, and your own leases if you have them.
