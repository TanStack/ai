---
title: Lifecycle and retention
id: harness-lifecycle
order: 4
description: "Release session handles with await using, let idle sessions close, cap the open sessions, read a thread without a session, bound what each session keeps in memory, and delete a thread for good."
keywords:
  - tanstack ai
  - harness
  - lifecycle
  - retention
  - await using
  - idle close
  - delete
---

Your server opens a session for each request. Each open session holds its plugins, its MCP processes, and its recent events in memory. A server that never lets them go grows until it runs out of memory. The host closes the sessions that nobody uses, caps how many stay open, and bounds what each session keeps.

## Open and release a session

Each `host.open` gives you a handle: your own reference to the live session of the thread. When you are done with the handle, release it. With `await using`, the release runs at the end of the block:

```ts group=harness-lifecycle
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export async function reply(threadId: string, message: string) {
  await using session = await host.open(assistant, { threadId })
  const turn = await session.send(message)
  return turn.text
}
```

- The handles of one thread share one live session. A release lets go of this handle only.
- `await session.close()` also releases the handle. A second call does nothing.
- After the release, each call on the handle throws `This handle is closed.` Call `host.open` again to get a new handle.
- A release does not stop work. A turn that runs goes on until it ends.
- If you drop a handle with no release, the garbage collector releases it, and the host logs one warning.
- A handle that you did not release holds its session. The session can still close under it, for example when its log fails or a [delete](#delete-a-thread-for-good) runs. Then the next call on the handle opens the session again. On a host with [`access`](./access), `isAllowed` checks that call again.

## When a session closes

The host closes a session when no handle holds it and it was idle for `lifecycle.closeIdleSessionsAfterMs`. Set the limits on the host:

```ts group=harness-lifecycle
const busyHost = createHarnessHost({
  persistence: memoryPersistence(),
  lifecycle: { closeIdleSessionsAfterMs: 30_000, maxOpenSessions: 200 },
})
```

- `closeIdleSessionsAfterMs`: how long an idle session with no handle stays open, in milliseconds. The default is 60 000. `0` closes it at once. A session is not idle while a background job of this host runs, for example a `bash` job.
- `maxOpenSessions`: how many sessions the host keeps open. The default is 500. An open past the limit first closes the least recently used sessions that are idle and that no handle holds.
- If every open session is busy or held, the open goes on, and the host logs one warning.
- A close cleans up the plugins of the session. The transcript and the other data stay in the stores, so the next open continues the thread. A workspace that `bind` gave the thread closes with `'moved'`, so an owned sandbox stays.
- The idle timer does not keep the Node process alive.

A plugin with `lifetime: 'host'` stays set up while another session uses it. See [Share one setup between sessions](./plugins#share-one-setup-between-sessions).

## Stop the host

`host.close()` closes every session of the host, for every handle. Then `host.open` throws:

```ts group=harness-lifecycle
await busyHost.close()
```

- Without options, the running work is cancelled.
- With `recoverable: true`, the running work stops, and another host runs it again. Use it when a host stops for a deploy. See [Stop a host for a deploy](./durable-sessions#stop-a-host-for-a-deploy).
- After the close, a call on a handle throws. `snapshot()` still gives the last state.
- The close also ends the event reads of each [view](#read-a-thread-without-a-session), and `host.observe` throws from then on.

## Read a thread without a session

A preview route or a status page only reads a thread. An open sets up every plugin, and can start MCP processes. `host.observe` reads the thread and opens no session.

On the server, read the transcript in your route:

```ts group=harness-lifecycle-observe
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})
const host = createHarnessHost({ persistence: memoryPersistence() })

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get('threadId')
  if (!threadId) return new Response('Missing threadId', { status: 400 })
  const view = await host.observe(assistant, { threadId })
  return Response.json(await view.transcript())
}
```

In the browser, fetch the route:

```ts group=harness-lifecycle-observe-client
const response = await fetch('/api/preview?threadId=chat-1')
console.log(await response.json())
```

On a host with `access`, pass the `user` of the request. The thread needs the `read` action, else `observe` throws `AccessDeniedError`. A thread with no index entry gets the same error, so a read creates no thread.

What the view reads for the chat:

- `transcript()`: the saved messages.
- `snapshot()`: the status and the waiting approvals. When the session is open on this host, it also has the running operations.
- `events({ from, signal })`: the events of the thread after a cursor.
- `agentTranscript({ subagentRunId })`: the messages of one child agent run.

What the view reads for the rest:

- `getMedia({ id })` and `loadMedia({ id, range })`: a media file and its bytes.
- `usage()`: the token totals of the thread.
- `indexEntry()`: the index entry of the thread.
- `logState()`: the `durability.logState` fold of the log. See [One log for a session tree](./shared-logs#keep-state-for-the-whole-tree).
- `jobs()`: the background jobs that did not end. See [Watch background jobs](./coding-workspaces#4-watch-background-jobs).

The view sets up no plugins, writes nothing, and never takes the log, so a read never fails because another host owns the thread. When the session is open on this host, the view reads through it, but it never holds the session open. The read paths of [`createHarnessHandler`](./connect) use the view, so a client that only reads starts no plugins. `GET describe` opens the session, because the plugins give the commands and the settings.

## Bound what a session keeps in memory

A thread can run for weeks. Each turn and each agent run that settles leaves its receipt, its result, and its events in memory. `lifecycle.retention` keeps a window of each and drops the oldest:

```ts group=harness-lifecycle
const leanHost = createHarnessHost({
  persistence: memoryPersistence(),
  lifecycle: {
    retention: { keepSettledOperations: 200, keepSettledAgentRuns: 100, maxEventBytesInMemory: 2_000_000 },
  },
})
```

| Limit | Default | Past the limit |
| --- | --- | --- |
| `keepSettledOperations` | 500 | `session.operation(id)` is `undefined` for the oldest settled turns, commands, and resets. |
| `keepSettledAgentRuns` | 500 | `session.agentRun(id)` and `session.agentRuns()` leave out the oldest settled agent runs. |
| `maxEventBytesInMemory` | 8 000 000 | `session.events()` keeps the newest events, by the JSON length of each event. A reader with an older cursor reads the older events from the log. |

The log keeps what memory drops:

- `session.settled({ inputId })` of an old input reads the log.
- `agentRun(id)` and `agentRuns()` also find the runs in the log.
- `events({ from })` reads the older events from the log.
- `maxEventBytesInMemory` also bounds the log tail that the host keeps in memory.

### Drop the records before a snapshot

The log store keeps every record by default. To keep it small, let the owner drop the records that a [snapshot](./durable-sessions#keep-a-long-log-fast-to-open) already holds:

```ts group=harness-lifecycle
const trimmedHost = createHarnessHost({
  persistence: memoryPersistence(),
  lifecycle: { retention: { keepLogRecords: 'since-snapshot' } },
})
```

- `'all'` (default): the store keeps every record.
- `'since-snapshot'`: after each snapshot, the owner truncates the records before it. The type is `LogRecordRetention`.
- A reader whose cursor is in the dropped part gets one `harness.gap` event, then the stream goes on. See [Cursors](./connect#cursors).
- `session.revert()` still works. The snapshot keeps the last 500 file steps of [`snapshots()`](./snapshots#go-back-to-an-earlier-message).

CAUTION: With `'since-snapshot'`, do not change `durability.logState` or `durability.addRecordsToModelContext` often. When the host cannot use the snapshot (its `logState` version or its `project` changed, or the snapshot has a newer version), a thread with dropped records cannot open. The open rejects with `LogTruncatedError`. Keep `'all'` if you change `reduce` often.

## Delete a thread for good

A user deletes a chat, and its data must go with it:

```ts group=harness-lifecycle
await leanHost.sessions.delete({ threadId: 'chat-1' })
```

First, `delete` closes the sessions of the thread and of its child threads, for every handle. The host finds the children through the `parentThreadId` of their index entries. Then it deletes this data:

- The log, with everything in it: the transcripts, the settings, the plugin config and state, the runs, the interrupts, the usage, the snapshots, and the inputs that wait for an owner.
- The index entry of each thread.
- The uploaded media and the generated artifacts.

The first-party plugins also end the thread:

- [`workspaceTools()`](./coding-workspaces) reattaches an owned sandbox of the thread and closes it with `'closed'`, so it is destroyed.
- [`snapshots()`](./snapshots#remove-the-snapshots-of-a-thread) removes the snapshot repository of the thread.
- This needs the index entry of the thread, and the harness of the thread on this host.

A host knows a harness when it opened a session of it. After a deploy or a restart, a new host has opened nothing. Give it the harnesses that it can delete threads of:

```ts group=harness-lifecycle
const deleteHost = createHarnessHost({
  persistence: memoryPersistence(),
  harnesses: [assistant],
})
```

A host that does not know the harness of a thread still deletes the data. It warns, and the plugins do not end the thread: an owned sandbox stays.

- On a host with `access`, `delete` needs the `delete` action. A child thread is checked through its root thread. A thread with no index entry throws `AccessDeniedError`.
- While the delete runs, an open of the thread throws. After the delete, a handle that you did not release opens a new, empty thread on its next call.
- A host without `stores.sessions` still closes the open sessions of the thread and deletes its data. It has no index entries, so it finds no child threads.
- `host.events()` yields a `session-deleted` event. See [Show a live status](./sessions#show-a-live-status).

## What you have now

- Handles that release at the end of a block, so idle sessions close by themselves.
- A cap on the open sessions of a host.
- Read routes that start no plugins and never take a thread.
- Sessions that keep a bounded window in memory, also after weeks of turns.
- A delete that removes the data of a thread and its children.
