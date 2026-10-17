---
title: Build on the session log
id: harness-session-log
order: 4
description: "Keep your framework's own records (signals, state writes, compaction) in the harness session log, and fold them into the model context."
keywords:
  - tanstack ai
  - harness
  - session log
  - LogStore
  - projection
  - compaction
---

Your framework keeps its own state next to the conversation: signals for the model, state writes, a compaction summary. Kept in a second store, it can drift from the transcript after a crash. Put these records in the harness session log. They share its atomic appends, its order, and its recovery.

## Append your own records

`session.append` adds records to the log of a [durable host](./durable-sessions), in one batch after the events that wait:

```ts group=harness-session-log
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const log = memoryLogStore()
const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({
  persistence: { stores: { log, runs: memoryPersistence().stores.runs } },
})
const session = await host.open(assistant, { threadId: 'thread-1' })

await session.append([{ type: 'app.signal', text: 'The build failed.' }])
```

- A record is JSON with a `type`. Types that start with `harness.` belong to the harness, so `append` refuses them.
- `append` resolves when the records are in the log.
- To share one log between a parent and its child sessions, see [Share one log between sessions](./shared-logs).
- In a tool, use `append` from [`durableTool`](./durable-tools), so the records land with the tool batch.

## Fold records into the model context

By default, the model does not see your records. Give the host a `project` function that folds a record into the messages. It gets one object, `{ messages, record }`, and returns the new list, or `undefined` for no change:

```ts group=harness-session-log
import type { ProjectOptions } from '@tanstack/ai-harness'

const project: ProjectOptions = {
  version: 'v1',
  record: ({ messages, record }) => {
    if (record.type === 'app.signal' && typeof record.text === 'string') {
      return [...messages, { role: 'user', content: record.text }]
    }
    return undefined
  },
}

const projectedHost = createHarnessHost({
  persistence: { stores: { log, runs: memoryPersistence().stores.runs } },
  project,
})
```

- `record` must be pure: the same log always folds to the same context, live and after a restart.
- The model sees the change at its next model call. A message that arrives during a tool call comes after the tool result.
- Change `version` when you change `record`. A fold checkpoint with another version is ignored.
- For compaction, use `projectCompaction` from `@tanstack/ai-compaction`. See [Compact a harness session](./compaction).
- A chat middleware on a durable host can append records itself with `getLogRecords(ctx).append([...])` from `@tanstack/ai`. The records land in the log at once. A plugin's middleware reads the writer with `getLogRecords(ctx, { optional: true })`. A plugin cannot list `LogRecordsCapability` in `requires`.

## Let a client add records

A webhook or a browser knows something that the model needs: the build failed, or a payment arrived. Let it add a record to the thread, and the next turn reads the record through `project`.

1. On the server, list the record types in `expose.records`. Serve the harness from the host that has `project`:

```ts group=harness-session-log
import { createHarnessHandler } from '@tanstack/ai-harness'

export const watcher = defineHarness({
  name: 'acme/build-watcher',
  adapter: openaiText('gpt-6.1-sol'),
  expose: { records: ['app.signal'] },
})

export const handler = createHarnessHandler({
  host: projectedHost,
  harness: watcher,
  authorize: (request) =>
    request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
      ? { id: 'ci-bot' }
      : null,
  canAccess: () => true,
  // A durable host signs media URLs with the same secret on every instance.
  mediaSecret: process.env.HARNESS_MEDIA_SECRET,
})
```

2. On the client, add the record with `client.append`. Then start a turn with `client.continue`, so the model answers the signal:

```ts group=harness-session-log-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { watcher } from './harness'

const client = createHarnessClient<typeof watcher>({
  url: '/api/harness',
  threadId: 'build-thread',
  headers: { authorization: 'Bearer my-token' },
})

await client.append([{ type: 'app.signal', text: 'The build failed.' }])
await client.continue()
```

- A record of another type is refused with `not_exposed`. So is a record with a `thread` field: a client writes only to its own thread.
- Types that start with `harness.` belong to the harness. `defineHarness` throws if `expose.records` lists one.
- The host must be durable. On a host with no log, the receipt is `rejected`.
- An MCP client adds records with the `append` tool. See [Use a harness from any MCP client](./mcp-server#3-use-the-tools).

## Read the log

The store is yours, so read your records back from it, for example to rebuild your state when a session opens:

```ts group=harness-session-log
const entries = await log.read({ logId: 'thread-1' })
const signals = entries.filter((entry) => entry.record.type === 'app.signal')
console.log(signals.map((entry) => entry.seq))
```

A reader outside a session that needs a `MessageStore`, for example `reconstructChat`, uses `logMessageStore`. It folds the log with the same `project`:

```ts group=harness-session-log
import { logMessageStore } from '@tanstack/ai-harness'

const messages = logMessageStore({ store: log, project })
console.log(await messages.loadThread('thread-1'))
```

## Tune how text streams into the log

A durable host merges streamed text and tool call arguments for `coalesceMs` (default 100) before it appends them. A message start or end, a tool call start or end, and your own records append at once.

```ts group=harness-session-log
const smoothHost = createHarnessHost({
  persistence: { stores: { log, runs: memoryPersistence().stores.runs } },
  coalesceMs: 250,
})
```

A larger value writes less often, and clients get text in larger parts.

## What you have now

- Your records in the same durable log as the conversation.
- A model context that folds them in, the same live and after a restart.
- Records that a webhook or a browser adds, for the record types you expose.
- A transcript that any reader can fold from the log.
