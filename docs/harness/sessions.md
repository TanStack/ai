---
title: List, rename, and fork sessions
id: harness-sessions
order: 4
description: "Show a sidebar of past chats with titles and a live status. Rename, remove, and fork a chat from the server or the browser."
keywords:
  - tanstack ai
  - harness
  - sessions
  - session index
  - sidebar
  - host events
---

Your app needs a sidebar of past chats. It shows the newest chat first, a title for each chat, and a mark on a chat that runs or waits for an answer. The host keeps a session index for this, with one entry per thread. It writes the entry when a thread opens and after each turn.

## Turn on the session index

Give the host a `sessions` store. `memoryPersistence()` has one. The `title()` plugin gives each session a title:

```ts group=harness-sessions
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { title } from '@tanstack/ai-harness/plugins'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [title({ adapter: openaiText('gpt-5.4-nano') })],
})

const host = createHarnessHost({ persistence: memoryPersistence() })

// Your own lookup: a session token to a user.
const users = new Map([['Bearer token-ada', { id: 'ada' }]])

export const handler = createHarnessHandler({
  host,
  harness: assistant,
  authorize: (request) => users.get(request.headers.get('authorization') ?? '') ?? null,
})

const session = await host.open(assistant, {
  threadId: 'chat-1',
  principal: { id: 'ada' },
})
await session.prompt('Plan a trip to Lisbon.')
console.log((await host.sessions.get('chat-1'))?.principal) // { id: 'ada' }
```

What an entry holds:

- `title`: the plugin writes it at the first turn, from the first user message. The turn does not wait for it. If the call fails, the next turn tries again.
- `updatedAt`: the time of the last change. The list sorts by it.
- `principal`: the owner. This is the user who opened the thread first.
- `usage`: the token totals of the thread.
- `parentThreadId`: the parent thread of a child session, for example a subagent run.

A durable host takes `sessions` next to `log`:

```ts group=harness-sessions
import { memoryLogStore } from '@tanstack/ai-persistence'

const { runs, sessions } = memoryPersistence().stores
const durableHost = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), runs, sessions } },
})
```

Without `stores.sessions`, `list` is empty, `get` returns `undefined`, and `rename` and `delete` write nothing. The HTTP routes on this page then find no sessions. To write your own store, read the [`SessionIndexStore` contract](../persistence/store-reference#sessionindexstore).

## List the sessions of a user

```ts group=harness-sessions
const page = await host.sessions.list({ principal: { id: 'ada' }, limit: 20 })
for (const entry of page.entries) {
  console.log(entry.threadId, entry.title ?? 'New chat')
}

if (page.truncated) {
  const next = await host.sessions.list({
    principal: { id: 'ada' },
    limit: 20,
    cursor: page.cursor,
  })
  console.log(next.entries.length)
}
```

- The newest `updatedAt` comes first.
- By default, the list has only top-level sessions. Pass `parentThreadId: 'chat-1'` to get the child sessions of `chat-1`.
- With `limit`, a page that has more entries after it has `truncated: true` and a `cursor`. Pass the `cursor` to get the next page.
- If `principal` has a `tenantId`, the tenant of the entry must match too.

In the browser, call `listSessions`. The handler lists only the sessions of the user that `authorize` returns, and only the threads that `canAccess` lets in:

```ts group=harness-sessions-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'chat-1',
  headers: { authorization: 'Bearer token-ada' },
})

const page = await client.listSessions({ limit: 20 })
const next = page.truncated
  ? await client.listSessions({ limit: 20, cursor: page.cursor })
  : undefined
```

The session calls of the client do not use its `threadId`. Each call names its thread in its own arguments.

## Fork a session

A fork copies a chat into a new chat, up to a message. Use it to try another answer, or to edit a message and send it again:

```ts group=harness-sessions
const [first] = await session.transcript()
if (!first?.id) throw new Error('The chat has no messages.')

const forked = await host.sessions.fork(assistant, 'chat-1', { before: first.id })
const fork = await host.open(assistant, { threadId: forked.threadId })
await fork.prompt('Plan a trip to Porto.')
```

- `{ through: id }` copies the messages up to and including `id`.
- `{ before: id }` copies the messages before `id`. A fork before the first message has no messages, but it keeps the settings.
- The host picks the new thread id. The new entry has the title of the old one plus ` (fork)`, and the same owner.
- If the transcript has no message with that id, `fork` throws.

In the browser, call `forkSession`, then open the new thread:

```ts group=harness-sessions-client
const forked = await client.forkSession('chat-1', { through: 'msg-7' })

const fork = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: forked.threadId,
  headers: { authorization: 'Bearer token-ada' },
})
await fork.prompt('Make the plan shorter.')
```

What a fork copies, and what it does not copy: [Fork and reset a thread](./fork-and-reset#fork-a-thread-at-a-message).

## Rename and remove a session

```ts group=harness-sessions
await host.sessions.rename(forked.threadId, 'Porto trip')
await host.sessions.delete('chat-1')
```

- `rename` resolves to the changed entry. For a thread with no entry, it resolves to `undefined`.
- `delete` removes the index entry only. The transcript, the log, the media, and the settings of the thread stay in their stores.
- After `delete`, the turns of the open session do not write the entry again. If the thread opens again after a restart, the host writes a new entry for it.

In the browser:

```ts group=harness-sessions-client
await client.renameSession(forked.threadId, 'Porto trip')
await client.deleteSession('chat-1')
```

A user can change only the sessions that the user owns. For a thread of another user, the handler answers `404`. For a thread that `canAccess` refuses, it answers `403`. The client calls throw for both.

## Show a live status

`host.events()` yields the changes of status and of the index. First it yields the current status of each open session:

```ts group=harness-sessions
const stop = new AbortController()

async function watch() {
  for await (const event of host.events({ signal: stop.signal })) {
    if (event.type === 'status') console.log(event.threadId, event.status)
    if (event.type === 'session') console.log('changed', event.entry.title)
    if (event.type === 'session-deleted') console.log('removed', event.threadId)
  }
}
void watch()
```

- `status`: `running` (an operation runs), `waiting` (a question or an approval waits for an answer), or `idle`. `at` is the time of the change.
- `session`: the host wrote an entry, for a new session, the end of a turn, a rename, or a fork. `entry` is the new entry.
- `session-deleted`: the host removed an entry. `entry` is the removed entry.

Each host reports only the sessions that are open in it. A session with no status event is not open, so show it as idle.

`host.close()` does not end the readers of `events()`. Abort the signal of each reader before you close the host. If you do not abort it, the loop waits forever:

```ts group=harness-sessions
stop.abort()
await host.close()
```

In the browser, read the same feed with `hostEvents`:

```ts group=harness-sessions-client
const statuses = new Map<string, 'idle' | 'running' | 'waiting'>()
const stop = new AbortController()

for await (const event of client.hostEvents({ signal: stop.signal })) {
  if (event.type === 'status') statuses.set(event.threadId, event.status)
  if (event.type === 'session-deleted') statuses.delete(event.threadId)
}
```

- The handler sends only the threads that the user owns in the index and that `canAccess` lets in. So the feed needs `stores.sessions`.
- The stream ends when the signal aborts or the server closes it. It does not reconnect. To reconnect, call `hostEvents()` again. The current statuses come first again.

To watch the sessions of many machines from a phone, without a screen of your own, use the [dashboard](./dashboard).

## What you have now

- A sidebar of past chats, newest first, with a title for each.
- Rename, remove, and fork, from the server and from the browser.
- A status for each chat that stays current.
