---
title: Share one log between sessions
id: harness-shared-logs
order: 4
description: 'Put a parent session and its child sessions in one durable log, append to several sessions at once, and keep state for the whole log.'
keywords:
  - tanstack ai
  - harness
  - shared log
  - logId
  - reduce
  - logState
  - child sessions
---

Your framework runs one agent instance with a parent conversation and child tasks. Each conversation in its own log means two problems. A record for the child and a record for the parent can land one without the other after a crash. And no one place holds the state of the whole instance. Open all the sessions on one log. They share the order of the log, its atomic appends, and one state fold.

## Open two sessions on one log

Pass the same `logId` to `host.open`. Each `threadId` is one session:

```ts group=harness-shared-logs
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const log = memoryLogStore()
const { runs, metadata } = memoryPersistence().stores
const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})
const host = createHarnessHost({
  persistence: { stores: { log, runs, metadata } },
})

const parent = await host.open(assistant, { threadId: 'agent-1' })
const child = await host.open(assistant, {
  threadId: 'task-1',
  logId: 'agent-1',
})

console.log(parent.logId, child.logId)
```

- `logId` defaults to `threadId`. The parent above has the log id `agent-1`, the same as its thread id.
- Each session folds only its own transcript, inputs, and events from the log. The child never sees the messages of the parent.
- The sessions run turns at the same time. A slow parent turn does not block a child turn.
- `session.logId` tells you which log a session writes to.

## Write to several sessions in one append

`session.append` stamps the records with this session. A record with `thread: '<other threadId>'` belongs to that session of the same log. The whole append is all or nothing:

```ts group=harness-shared-logs
await parent.append([
  { type: 'app.child_created', thread: 'task-1', task: 'research' },
  { type: 'app.child_linked', child: 'task-1' },
])
```

Here the child record and the link in the parent land together, or not at all.

- `thread` must be a string. Any other value makes `append` throw.
- The session whose thread id equals the log id (the parent above) writes no `thread` field. A record without `thread` belongs to it.

## Keep state for the whole log

Give the host a `reduce` option. It folds every host record of the log, from all sessions, in log order. Then `host.logState` reads the result:

```ts group=harness-shared-logs
import type { ReduceOptions } from '@tanstack/ai-harness'

interface Children {
  tasks: Array<string>
}

const reduce: ReduceOptions<Children> = {
  initial: { tasks: [] },
  version: 'v1',
  record: ({ state, record }) =>
    record.type === 'app.child_created' && typeof record.thread === 'string'
      ? { tasks: [...state.tasks, record.thread] }
      : state,
}

const trackedHost = createHarnessHost({
  persistence: { stores: { log, runs, metadata } },
  reduce,
})
const tracked = await trackedHost.open(assistant, { threadId: 'agent-2' })
await tracked.append([
  { type: 'app.child_created', thread: 'task-2', task: 'research' },
])

console.log(trackedHost.logState('agent-2')?.tasks)
```

- `record` must be pure. It returns the next state, or the same state for no change.
- `host.logState(logId)` works for a log that has an open session in this host. Otherwise it returns `undefined`.
- The type of the state flows from `initial` and `record`. Here `logState` returns `Children | undefined`.
- Change `version` when you change `record`. A fold checkpoint with another version is ignored.
- `project` still works. It folds a host record into the messages of its own session only.

## One writer per log

Only one host writes a log at a time. When another host writes to it:

1. Every session of that log in this host stops. Their next `append` throws a log conflict.
2. The next `host.open` for that log folds the log again and gives you a new session.

One thread can have one open session per log. A second harness on the same thread and log throws.

To read one thread of a shared log outside a session, pass `logId` to `logMessageStore`:

```ts group=harness-shared-logs
import { logMessageStore } from '@tanstack/ai-harness'

const messages = logMessageStore({ store: log, logId: 'agent-1' })
console.log(await messages.loadThread('task-1'))
```

## What you have now

- Many sessions in one durable log, each with its own transcript.
- Appends that reach several sessions and land all together or not at all.
- One state for the whole log, from `reduce`, that you read with `host.logState`.
- A clear rule for conflicts: one writer, and a fresh fold on the next open.
