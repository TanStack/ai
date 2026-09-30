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
- `runs`: run records with leases. A lease tells the next host that the last one stopped.

```ts group=harness-durable
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'

// Swap in your own stores. Memory stores do not survive a restart.
const { runs, metadata } = memoryPersistence().stores

const host = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), runs, metadata } },
})
```

`metadata` is optional. With it, the host keeps a fold checkpoint of each log, so a long thread opens faster. To store the log in your database, implement the [`LogStore` contract](../persistence/store-reference#logstore).

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

## What you have now

- Turns that continue after a crash or a deploy, from the session log.
- A turn that stops after `maxAttempts` or `timeoutMs`, with a clear error code.
- Tools that either run again safely or tell the model to check first.
