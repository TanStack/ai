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

`session.append` adds records to the [session log](./durable-sessions), in one batch after the events that wait:

```ts group=harness-session-log
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const persistence = memoryPersistence()
const { log } = persistence.stores
const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({ persistence })
const session = await host.open(assistant, { threadId: 'thread-1' })

await session.appendRecords({ records: [{ type: 'app.signal', text: 'The build failed.' }] })
```

- A record is JSON with a `type`. Types that start with `harness.` belong to the harness, so `appendRecords` refuses them.
- `appendRecords` resolves with a receipt when the records are in the log. When another host owns the thread, the receipt is `queued`, and the owner writes the records. See [One host drives a thread](./durable-sessions#one-host-drives-a-thread).
- Pass `inputId` to make the append safe to send again: `session.appendRecords({ records, inputId: 'signal-7' })`. A second append with the same id writes nothing. Without `inputId`, the append gets a new id. The receipt has the id, as the log keeps it. `user` sets who appends. The default is the user who opened the session.
- A record can belong to a child thread of the same log. See [One log for a session tree](./shared-logs).
- In a tool, use `append` from [`durableTool`](./durable-tools), so the records land with the tool batch.
- A key or a token of the session in a record goes into the log as `[redacted]`. See [Keep tokens out of the log and the model](./auth#keep-tokens-out-of-the-log-and-the-model).

### Keep records after a truncate

With [`keepLogRecords: 'since-snapshot'`](./lifecycle#drop-the-records-before-a-snapshot), the store drops the records before each snapshot. A plugin can make the snapshot keep the last records of its own types with `keepRecords`, and read them back with `ctx.session.keptRecords(type)`:

```ts group=harness-session-log
import { defineCommand, definePlugin } from '@tanstack/ai-harness'

export const steps = definePlugin({
  name: 'acme/steps',
  keepRecords: { 'acme/steps:step': 100 },
  setup: (ctx) => ({
    commands: {
      steps: defineCommand({
        description: 'Count the kept steps',
        run: async () => (await ctx.session.keptRecords('acme/steps:step')).length,
      }),
    },
  }),
})
```

- The snapshot keeps the last 100 `acme/steps:step` records of each thread.
- `keptRecords` gives the kept records of that type of this thread, oldest first. It works before and after a truncate.
- [`snapshots()`](./snapshots#go-back-to-an-earlier-message) keeps its last 500 file steps this way, so `session.revert()` works after a truncate.
- The plugins of the harness of the root thread decide, because that harness folds the log. A type in two plugins keeps the larger count.

## Fold records into the model context

By default, the model does not see your records. Set `durability.addRecordsToModelContext` on the harness to fold a record into the messages. Its `record` function gets one object, `{ messages, record }`, and returns the new list, or `undefined` for no change:

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

export const projected = defineHarness({
  name: 'acme/projected',
  adapter: openaiText('gpt-6.1-sol'),
  durability: { addRecordsToModelContext: project },
})
```

- `record` must be pure: the same log always folds to the same context, live and after a restart.
- The model sees the change at its next model call. A message that arrives during a tool call comes after the tool result.
- Change `version` when you change `record`. A log snapshot with another version is not used, so the host folds the log again from the first record.
- For compaction, use `projectCompaction` from `@tanstack/ai-compaction`. See [Compact a harness session](./compaction).
- A chat middleware in a harness turn can append records itself with `getLogRecords(ctx).append([...])` from `@tanstack/ai`. The records land in the log at once. A plugin's middleware reads the writer with `getLogRecords(ctx, { optional: true })`. A plugin cannot list `LogRecordsCapability` in `requires`.

## Let a client add records

A webhook or a browser knows something that the model needs: the build failed, or a payment arrived. Let it add a record to the thread, and the next turn reads the record through `durability.addRecordsToModelContext`.

1. On the server, list the record types in `expose.records`, and set `durability.addRecordsToModelContext` on the same harness:

```ts group=harness-session-log
import { createHarnessHandler } from '@tanstack/ai-harness/server'

export const watcher = defineHarness({
  name: 'acme/build-watcher',
  adapter: openaiText('gpt-6.1-sol'),
  expose: { records: ['app.signal'] },
  durability: { addRecordsToModelContext: project },
})

const watcherHost = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) =>
      request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
        ? { id: 'ci-bot' }
        : null,
    // The CI bot is the only user, so it can use every thread.
    rules: { isAllowed: ({ user }) => user.id === 'ci-bot' },
  },
})

// Every instance signs media URLs with the same secret.
const mediaSecret = process.env.HARNESS_MEDIA_SECRET
if (!mediaSecret) throw new Error('Set HARNESS_MEDIA_SECRET.')

export const handler = createHarnessHandler({
  host: watcherHost,
  harness: watcher,
  media: { secret: mediaSecret },
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

await client.appendRecords({ records: [{ type: 'app.signal', text: 'The build failed.' }] })
await client.continueWithoutMessage()
```

- A record of another type is refused with `not_exposed`. So is a record with a `thread` field: a client writes only to its own thread.
- Types that start with `harness.` belong to the harness. `defineHarness` throws if `expose.records` lists one.
- An MCP client adds records with the `append` tool. See [Use a harness from any MCP client](./mcp-server#3-use-the-tools).

## Read the log

The store is yours, so read your records back from it, for example to rebuild your state when a session opens. The store keeps each log under an id with its tenant, so build the id with `logIdOf`:

```ts group=harness-session-log
import { logIdOf } from '@tanstack/ai-harness'

// The default tenant. For a tenant, pass `tenantId` too: 'acme:thread-1'.
const entries = await log.read({ logId: logIdOf({ logId: 'thread-1' }) })
const signals = entries.filter((entry) => entry.record.type === 'app.signal')
console.log(signals.map((entry) => entry.seq))
```

Each `harness.input` record has the `user` of its sender: its `id` and `tenantId`. Every kind of input has it when the sender is known, also a cancel, an answer, a delivery change, and a change of settings.

Two harness records tell who answers a thread and where a conversation went. See [Hand off a conversation](./handoffs).

- `harness.handoff`: another agent answers from now on. It has `from` and `to` (an agent name, `null` for the main model, or `{ human: true }` for a person), the `note`, the `runId`, and `by` (`'tool'`, `'code'`, `'router'`, or `'operator'`). A handoff to a person also has the `waitId` of its `human` wait. The last one is the active agent of the thread.
- `harness.transferred`: `host.transfer` moved the conversation. The log of the target has `from`, and the log of the source has `to`. Each is `{ harness, threadId }`. Both records have the same `transferId`, the `user`, and `at`.

```ts group=harness-session-log
const handoffs = entries.filter((entry) => entry.record.type === 'harness.handoff')
console.log(handoffs.at(-1)?.record.to)
```

A reader outside a session that needs a `MessageStore`, for example `reconstructChat`, uses `logMessageStore`. It folds the log with the same `addRecordsToModelContext`. Pass `tenantId` to read the threads of a tenant:

```ts group=harness-session-log
import { logMessageStore } from '@tanstack/ai-harness'

const messages = logMessageStore({ store: log, project })
console.log(await messages.loadThread('thread-1'))
```

## Find the runs in the log

Your dashboard shows every agent run of a thread, also the runs that ended long ago. The log has one `harness.run.node` record for each run that the session admits:

```ts group=harness-session-log
const records = (await log.read({ logId: logIdOf({ logId: 'thread-1' }) })).map(
  (entry) => entry.record,
)
const agentNodes = records.filter(
  (record) => record.type === 'harness.run.node' && record.kind === 'agent',
)
console.log(agentNodes.map((record) => [record.runId, record.agent, record.parentRunId]))
```

- A `harness.run.node` record has `runId`, `kind` (`turn`, `agent`, or `command`), and the `user` when it is known. An agent run also has `agent`, and `parentRunId`, `key`, `limits`, and `budget` when it has them.
- Read only these fields. The other fields of the record are bookkeeping of the session, and they can change.
- The tree also has `tool` runs. These come from `harness.run` records, not from `harness.run.node` records.
- The status, the result, and the error come from later records: `harness.run`, `harness.run.update`, and `harness.agent.result`. A session folds them into one tree. See [The run tree](./subagents#the-run-tree).
- Each `harness.usage` record has the `runId` of the run that made the model call. See [Usage of one run](./usage#usage-of-one-run).
- A `harness.state` record has a `key` and one change to its value. It is the shared state of [`ctx.harness.state`](./subagents#share-state-between-agents).

## Tune how text streams into the log

A host merges streamed text and tool call arguments for `log.bufferStreamWriteMs` milliseconds (default 100) before it appends them. A message start or end, a tool call start or end, and your own records append at once.

```ts group=harness-session-log
const smoothHost = createHarnessHost({
  persistence: memoryPersistence(),
  log: { bufferStreamWriteMs: 250 },
})
```

A larger value writes less often, and clients get text in larger parts.

## What you have now

- Your records in the same durable log as the conversation.
- A model context that folds them in, the same live and after a restart.
- Records that a webhook or a browser adds, for the record types you expose.
- A transcript that any reader can fold from the log.
- Every run of the thread, and the shared state of its agents, in records that you can read.
