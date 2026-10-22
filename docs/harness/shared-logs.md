---
title: One log for a session tree
id: harness-shared-logs
order: 4
description: 'A root thread and its child threads (agent runs and subagents) write to one durable log. Append to several threads at once, and keep one state for the whole tree.'
keywords:
  - tanstack ai
  - harness
  - shared log
  - session tree
  - reduce
  - logState
  - child threads
---

Your framework runs one agent with a main conversation and child tasks. If each conversation has its own log, two things go wrong. A record for the child and a record for the parent can land one without the other after a crash. And no one place holds the state of the whole agent. A harness keeps the whole tree in one log, so the threads share its order, its atomic appends, and one state fold.

## One log per session tree

Open the root thread. Each child thread that the harness starts writes to the log of that root:

- An agent run and its follow-ups (`<threadId>:<name>:<input id>`).
- A subagent run (`subagent:<runId>`).
- A session of another harness that runs as a child with [`harnessAgent`](./subagents#call-a-harness-as-a-child) (`<root thread id>/agent/<run id>`).

```ts group=harness-shared-logs
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const persistence = memoryPersistence()
const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({ persistence })

const root = await host.open(assistant, { threadId: 'agent-1' })
```

- The log has the id of the root thread, in its tenant: `logIdOf({ tenantId, logId: 'agent-1' })`.
- Each thread folds only its own transcript, inputs, and events from the log. A child never sees the messages of the root.
- A child thread does not open. Open its root, and read the child with `session.agentTranscript({ subagentRunId })`. `host.open` throws for the thread id of a `harnessAgent` child.
- `host.observe` also reads a child thread by its own thread id. It finds the root through the session index, so it needs `stores.sessions`. `memoryPersistence()` has it.

## Write to several threads in one append

`session.append` adds records to the root thread. A record with `thread: '<other threadId>'` belongs to that thread of the same log. The whole append is all or nothing:

```ts group=harness-shared-logs
await root.appendRecords({
  records: [
    { type: 'app.child_created', thread: 'task-1', task: 'research' },
    { type: 'app.child_linked', child: 'task-1' },
  ],
})
```

Here the child record and the link in the root land together, or not at all.

- `thread` must be a string. Any other value makes `appendRecords` throw.
- A record without `thread` belongs to the root thread.

## Keep state for the whole tree

Give the harness a `durability.logState` option. It folds every host record of the log, from the root and from each child thread, in log order. Then `session.logState()` reads the result:

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

const tracker = defineHarness({
  name: 'acme/tracker',
  adapter: openaiText('gpt-6.1-sol'),
  durability: { logState: reduce },
})
const tracked = await host.open(tracker, { threadId: 'agent-2' })
await tracked.appendRecords({
  records: [{ type: 'app.child_created', thread: 'task-2', task: 'research' }],
})

console.log((await tracked.logState())?.tasks)
```

- `record` must be pure. It returns the next state, or the same state for no change.
- The type of the state flows from `initial` and `record`. Here `logState()` resolves to `Children | undefined`. A harness without `logState` gets `undefined`.
- The fold comes from the log, so a session on another machine gets the same state.
- Change `version` when you change `record`. A log snapshot with another version is not used, so the host folds the log again from the first record.
- `durability.addRecordsToModelContext` also works with `logState`. It folds a host record into the messages of its own thread only.
- Every harness that opens the same log must pass the same `addRecordsToModelContext` and `logState` objects. When a harness with other ones opens a log that is open, `host.open` throws, and so do the reads of `host.observe`.

A read route that opens no session gets the same state from a view:

```ts group=harness-shared-logs
const view = await host.observe(tracker, { threadId: 'agent-2' })
console.log((await view.logState())?.tasks)
```

## One writer per log

Only one host writes a log at a time. When another host takes the log, the sessions of that log on this host stay open and read on. Their next write takes the log back, when no other host owns it. See [One host drives a thread](./durable-sessions#one-host-drives-a-thread).

One root thread has one open session per host. A second harness on the same thread throws.

To read a root thread outside a session, for example for `reconstructChat`, use `logMessageStore`:

```ts group=harness-shared-logs
import { logMessageStore } from '@tanstack/ai-harness'

const messages = logMessageStore({ store: persistence.stores.log })
console.log(await messages.loadThread('agent-1'))
```

Each thread id that you pass is the root of a tree. To read a child thread, use `host.observe`.

## What you have now

- One durable log for a root thread and all of its child threads, each with its own transcript.
- Appends that reach several threads and land all together or not at all.
- One state for the whole tree, from `durability.logState`, that you read with `session.logState()` on any machine.
