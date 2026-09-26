---
title: Durable sessions
id: harness-durable-sessions
order: 4
description: "Keep a harness turn alive through a crash or a deploy. The next host continues it from the last checkpoint."
keywords:
  - tanstack ai
  - harness
  - durability
  - resume
  - checkpoint
---

A long agent turn can outlive the process that started it: a deploy restarts the server, or the machine crashes in the middle of a tool call. With durable stores, the next host that opens the session continues the turn from its last checkpoint.

## Give the host durable stores

Use your own stores built with `defineAIPersistence`. Resume needs these:

- `messages`: the transcript.
- `runs`: the run records, with leases and checkpoints. Implement `listByThread`.
- `inbox`: messages that were accepted but did not run yet.

```ts group=harness-durable
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

// Swap in your own stores. Memory stores do not survive a restart.
const host = createHarnessHost({ persistence: memoryPersistence() })
```

## What the session saves while a turn runs

- A lease on the run record. The host renews it every 10 seconds. It expires after 30 seconds.
- The transcript before and after each tool phase.
- Each tool call that started and has no result yet.

## What happens after a crash

When a host opens the session and finds a turn whose lease expired, it continues that turn in a new run:

1. The old run is marked failed.
2. Tool calls without a result get handled by their `replay` setting.
3. A new chat run starts from the saved transcript.
4. Clients see a `harness.operation.resumed` event, then the new events.

## Mark tools that are safe to run again

A crash can stop a run after a tool started but before its result was saved. Tell the harness what to do with `replay`:

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
- `replay: 'never'` (default): the model gets a note that the tool may or may not have run, and checks before it tries again.

A model response that was cut in the middle runs again after resume. The provider can bill that call twice.

## What you have now

- Turns that continue after a crash or a deploy.
- Tools that either run again safely or tell the model to check first.
