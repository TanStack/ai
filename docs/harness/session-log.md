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
  adapter: openaiText('gpt-5.6'),
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
    if (
      record.type === 'app.compaction' &&
      typeof record.summary === 'string' &&
      typeof record.firstKept === 'number'
    ) {
      return [
        { role: 'assistant', content: record.summary },
        ...messages.slice(record.firstKept),
      ]
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

## Read the log

The store is yours, so read your records back from it, for example to rebuild your state when a session opens:

```ts group=harness-session-log
const entries = await log.read('thread-1')
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

A durable host merges streamed text for `coalesceMs` (default 100) before it appends it. A message start or end, a tool call, and your own records append at once.

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
- A transcript that any reader can fold from the log.
