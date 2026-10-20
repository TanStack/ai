---
title: List, rename, and fork sessions
id: harness-sessions
order: 4
description: "Show a sidebar of past chats with titles and a live status. Rename, remove, fork, and revert a chat, and keep typed app data on each one."
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

Give the host a `sessions` store. `memoryPersistence()` has one:

```ts group=harness-sessions
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

// The app data of each session. See "Keep app data on a session" below.
export const pinnedFilesSchema = z.object({ pinnedFiles: z.array(z.string()) })

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  metadataSchema: pinnedFilesSchema,
})

const host = createHarnessHost({ persistence: memoryPersistence() })

const session = await host.open(assistant, {
  threadId: 'chat-1',
  user: { id: 'ada' },
})
await session.send('Plan a trip to Lisbon.')
console.log((await host.sessions.get({ threadId: 'chat-1' }))?.members) // [{ userId: 'ada', role: 'owner' }]
```

`host.open` gives you a handle. When you are done with it, release it with `await session.close()`. Or open it with `await using`, which releases it at the end of the block. Then the session can close when it goes idle. See [Lifecycle and retention](./lifecycle#open-and-release-a-session).

What an entry holds:

- `title`: the name of the chat. Set it with `host.sessions.rename`, or from a plugin with `ctx.session.updateIndexEntry({ title })`.
- `updatedAt`: the time of the last change. The list sorts by it.
- `members`: the users who can open the thread, each with a role. The user who opened the thread first is the member with the role `owner`.
- `tenantId`: the tenant of the thread. Without it, the thread is in the default tenant. See [Access and tenants](./access).
- `usage` and `parentThreadId`: the token totals of the thread, and the parent thread of a child session, for example a subagent run.

The host takes `sessions` next to `log`:

```ts group=harness-sessions
import { memoryLogStore } from '@tanstack/ai-persistence'

const { sessions } = memoryPersistence().stores
const durableHost = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), sessions } },
})
```

- Without `stores.sessions`, `list` is empty, `get` returns `undefined`, and `rename` and `update` write nothing.
- The store needs `getVersioned` and `upsertIf`, else `createHarnessHost` throws. The host changes an entry with compare-and-set, so two hosts never lose each other's changes.
- To write your own store, read the [`SessionIndexStore` contract](../persistence/store-reference#sessionindexstore).

Each method of `host.sessions` takes one object with a `threadId` or filters, and a `user`. The tenant of `user` picks the entries. On a host with `access`, the `user` is required, and the host checks each call. See [Access and tenants](./access).

## List the sessions of a user

```ts group=harness-sessions
const page = await host.sessions.list({ user: { id: 'ada' }, limit: 20 })
for (const entry of page.entries) {
  console.log(entry.threadId, entry.title ?? 'New chat')
}

if (page.truncated) {
  const next = await host.sessions.list({
    user: { id: 'ada' },
    limit: 20,
    cursor: page.cursor,
  })
  console.log(next.entries.length)
}
```

- The newest `updatedAt` comes first.
- By default, the list has only top-level sessions. Pass `parentThreadId: 'chat-1'` to get the child sessions of `chat-1`.
- With `limit`, a page that has more entries after it has `truncated: true` and a `cursor`. Pass the `cursor` to get the next page.
- A list reads one tenant: the tenant of `user`. Without a `tenantId`, the default tenant.
- Without host `access`, the list has every session of that tenant. With `membersOnly()`, it has only the sessions where `user` is a member. With your own `isAllowed`, it has the sessions that `isAllowed` lets `user` list.

To find sessions, add filters. All filters must match, and `limit` and `cursor` page the filtered list:

```ts group=harness-sessions
const found = await host.sessions.list({
  user: { id: 'ada' },
  search: 'trip',
  harness: 'acme/assistant',
  metadata: { project: 'p-1' },
})
```

- `search` keeps the sessions whose title contains the text, without case. A session with no title never matches.
- `harness` keeps the sessions of the harness with this `name`.
- `metadata` keeps the sessions that have each key with exactly this string value.

## Fork a session

A fork copies a chat into a new chat, up to a message. Use it to try another answer, or to edit a message and send it again:

```ts group=harness-sessions
const [first] = await session.transcript()
if (!first?.id) throw new Error('The chat has no messages.')

const forked = await host.sessions.fork({
  harness: assistant,
  threadId: 'chat-1',
  at: { before: first.id },
})
const fork = await host.open(assistant, { threadId: forked.threadId })
await fork.send('Plan a trip to Porto.')
```

- `at: { through: id }` copies the messages up to and including `id`.
- `at: { before: id }` copies the messages before `id`. A fork before the first message has no messages, but it keeps the settings.
- The host picks the new thread id. The new entry has the title of the old one plus ` (fork)`. A thread without a title gives a fork without a title.
- With a `user` and host `access`, the user who forks owns the fork. `members` picks who else is in it. See [Fork a shared thread](./shared-threads#6-fork-a-shared-thread). Without access and without `members`, the fork keeps the owner and the members of the old thread.
- If the transcript has no message with that id, `fork` throws.
- If the index entry of the thread names another harness, `fork` throws. One host can run more than one harness. To move a chat to another harness, use [`host.transfer`](./handoffs#5-move-a-conversation-to-another-harness).

What a fork copies, and what it does not copy: [Fork and reset a thread](./fork-and-reset#fork-a-thread-at-a-message).

## Go back to an earlier message

A fork keeps the old chat. To go back in the same chat, revert it to a message:

```ts group=harness-sessions
const [question] = await session.transcript()
if (!question?.id) throw new Error('The chat has no messages.')

await session.revert({ messageId: question.id })
// The transcript now ends at `question`. To bring the later messages back:
await session.unrevert()
```

- While a revert stands, `transcript()` hides the messages after that message. The session keeps them.
- The next turn drops the hidden messages for good. A steer, a follow-up, and `continueWithoutMessage` are turns too.
- The session saves the revert in the log. A restart keeps it.
- Each change sends a `harness.revert` event. Read the transcript again when it arrives.
- `revert` and `unrevert` refuse with `busy` when the session is not idle, or when another host runs the thread. `revert` refuses with `unknown_message` for an id that is not in the transcript.

## Rename and remove a session

```ts group=harness-sessions
await host.sessions.rename({ threadId: forked.threadId, title: 'Porto trip' })
await host.sessions.delete({ threadId: 'chat-1' })
```

- `rename` resolves to the changed entry. For a thread with no entry, it resolves to `undefined`.
- `delete` closes the sessions of the thread and of its child threads, for every handle. Then it deletes their data: the log or the messages, the index entry, the media, the settings, and the usage.
- The next user who opens the same `threadId` starts empty. The host writes a new entry for the thread, with that user as the owner.

For the full list of what `delete` removes, and what stays, see [Delete a thread for good](./lifecycle#delete-a-thread-for-good).

## Keep app data on a session

Your composer lets a user pin files to a chat. The pins must stay with the chat, show again after a reload, and work on each of your servers. Keep them in the `metadata` of the session entry.

The `assistant` at the top of this page has a `metadataSchema`. It types `metadata`, and each write checks it.

Write the pins from your server code. No session has to be open:

```ts group=harness-sessions
await host.sessions.update({
  harness: assistant,
  threadId: forked.threadId,
  update: { metadata: { pinnedFiles: ['src/auth.ts'] } },
})

// Add one file, and keep the files that are there.
await host.sessions.update({
  harness: assistant,
  threadId: forked.threadId,
  update: (entry) => ({
    metadata: {
      pinnedFiles: [...(entry.metadata?.pinnedFiles ?? []), 'src/login.tsx'],
    },
  }),
})
```

- Each field that you give replaces the stored field: `title`, `pinned`, and `metadata`.
- An `update` function gets the current entry. Use it to change a part of `metadata`.
- `update` resolves to the changed entry. For a thread with no entry, it resolves to `undefined`.
- For metadata that the schema refuses, `update` throws `SessionMetadataError` and writes nothing.
- For a thread that another harness runs, `update` throws.

### Writes from several servers

A turn on one server writes the usage of the thread. At the same time, the app on another server can write the pins. The store keeps both writes with `getVersioned` and `upsertIf`: when another server wrote first, the host runs your change function again on the new entry. For the rules of your own store, read [Keep the writes of several hosts](../persistence/store-reference#keep-the-writes-of-several-hosts).

### Read and write the metadata in a plugin

Give the plugin the same schema. Then `ctx.session.indexEntry()` and `ctx.session.updateIndexEntry()` are typed, and the schema checks each write of the plugin:

```ts group=harness-sessions
import { defineCommand, definePlugin } from '@tanstack/ai-harness'

export const pins = definePlugin({
  name: 'acme/pins',
  metadataSchema: pinnedFilesSchema,
  setup: (ctx) => ({
    commands: {
      unpin: defineCommand({
        description: 'Unpin a file from this chat',
        input: z.object({ file: z.string() }),
        run: ({ file }) =>
          ctx.session.updateIndexEntry((entry) => ({
            metadata: {
              pinnedFiles: (entry.metadata?.pinnedFiles ?? []).filter(
                (pinned) => pinned !== file,
              ),
            },
          })),
      }),
    },
  }),
})
```

Add `pins` to the `plugins` of the harness. If the harness metadata does not fit the schema of a plugin, TypeScript shows an error. The turn hooks of the harness also get a typed `session.indexEntry()`.

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
- `session`: the host wrote an entry, for a new session, the end of a turn, a rename, an update, or a fork. `entry` is the new entry.
- `session-deleted`: the host removed an entry. `entry` is the removed entry.
- `revoked`: `host.revoke` or `unshare` took the access of the user `userId` to `threadId`. See [Use your own access tables](./access#use-your-own-access-tables).

Each host reports only the sessions that are open in it. For those sessions, the status also counts the turns and the questions that another host writes to the same log. A session with no status event is not open, so show it as idle.

A reader that does not keep up stops. When more than 1 000 changes wait for it, its loop ends. The first statuses do not count. Call `host.events()` again: the current statuses come first again.

`host.close()` does not end the readers of `events()`. Abort the signal of each reader before you close the host. If you do not abort it, the loop waits forever:

```ts group=harness-sessions
stop.abort()
await host.close()
```

## React to events

Want to do something each time a session sends a certain event? Hand the session a listener. It calls your function for you, so you do not need a loop:

```ts group=harness-sessions
const stopListening = session.onEvent('RUN_ERROR', ({ operationId, event }) => {
  console.error(`Operation ${operationId} failed: ${event.message}`)
})

// Later, when you do not need it any more:
stopListening()
```

- Put an event type first to get only that type. `event` then has the type you asked for.
- Leave the type out to get every event: `session.onEvent(({ event }) => {})`.
- `operationId` tells you which operation sent the event. For one operation only, call `onEvent` on that operation.
- The session calls your listener as soon as it sends the event. A listener that throws does not stop the turn. Keep listeners fast, because a slow one slows the stream.
- A listener gets live events only. To read the events again after a restart, keep the `cursor` of an entry from `session.events()`, then pass it back as `from`.

## What you have now

- A sidebar of past chats, newest first, with a title for each.
- Rename, remove, fork, and revert from your server code.
- Typed app data on each session, such as the pinned files of a chat.
- A status for each chat that stays current.
- A listener that runs your code when a session sends an event.
