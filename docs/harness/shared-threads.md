---
title: Share a thread between people
id: harness-shared-threads
order: 7
description: "Let several people write in one thread. Each message runs as its sender, with the credentials and the provider key of that person."
keywords:
  - tanstack ai
  - harness
  - shared thread
  - principal
  - tenantId
  - canJoin
---

Several people write in one thread: a team in one chat, or a customer and a support agent. A message from Bob must run as Bob. His GitHub token and his provider key must do the work, not those of the person who opened the thread first. The harness runs each message as the person who sent it.

## 1. Return the sender from `authorize`

`authorize` decides who sends each request. Each message runs as the principal that it returns. If your users belong to organizations, add `tenantId`:

```ts group=harness-shared-threads
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

// Your own lookups: a session token to a user, and a thread to its members.
const users = new Map([
  ['Bearer token-ada', { id: 'ada', tenantId: 'acme' }],
  ['Bearer token-bob', { id: 'bob', tenantId: 'acme' }],
])
const members = new Map([['team-thread', ['ada', 'bob']]])

export const handler = createHarnessHandler({
  host,
  harness: assistant,
  authorize: (request) => users.get(request.headers.get('authorization') ?? '') ?? null,
  canAccess: (principal, threadId) =>
    members.get(threadId)?.includes(principal.id) ?? false,
})
```

You pass nothing else. The sender of each request is used everywhere:

- The log keeps the sender of each message. After a restart, a message runs again as its sender.
- The tools of a turn get the credentials of the sender, in `ctx.credentials`.
- The model call uses the provider key of the sender, in `ctx.keys`. So the sender pays for the call.
- In a plugin, `ctx.session.principal` is the sender of the running turn. Outside a turn, it is the person who opened the session first.
- Commands, for example `connect:github`, run as their sender. So a sign-in belongs to the person who signed in. A turn that waits for a sign-in continues only when its own sender signs in.
- `mcpConnector` keeps the sign-in and the tools of each sender apart.

`handleHarnessSocket` works the same way. Every input on the socket runs as the `principal` that you give it. Context that a client sends with a message is client data, and it never changes the sender. See [Send context with a message](./inputs#send-context-with-a-message).

## 2. Connect each person

Each person opens the same thread with their own token. This snippet shows two clients. In a real app, each person has one client in their own browser:

```ts group=harness-shared-threads-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const ada = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'team-thread',
  headers: { authorization: 'Bearer token-ada' },
})
const bob = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'team-thread',
  headers: { authorization: 'Bearer token-bob' },
})

await ada.prompt('Open an issue for the login bug.')
await bob.prompt('List my open pull requests.')
```

Bob sends his message while the turn of Ada runs. His message waits. Then it runs as its own turn, as Bob.

On the server, give the sender to `prompt` yourself. `steer`, `followUp`, `resolve`, and `command` take `principal` too. Without it, the message runs as the person who opened the session:

```ts group=harness-shared-threads
const session = await host.open(assistant, { threadId: 'team-thread' })
const ada = { id: 'ada', tenantId: 'acme' }

session.prompt('Summarize the open issues.', { principal: ada })
session.command('connect:github', undefined, { principal: ada })
```

A command acts for the person who runs it. In its `run` context, `session.principal` is that person, and `session.prompt` runs as that person.

If you write a command that saves a sign-in or a key, save it with the `credentials` of the second `run` argument. Those credentials belong to the person who runs the command. The `ctx.credentials` of `setup` belong to the sender of the running turn:

```ts group=harness-shared-threads
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { z } from 'zod'

export const linearKey = definePlugin({
  name: 'acme/linear-key',
  setup: () => ({
    commands: {
      'connect:linear': defineCommand({
        description: 'Save a Linear API key',
        input: z.object({ key: z.string() }),
        run: async ({ key }, { credentials }) => {
          await credentials.set('linear', { type: 'api_key', value: key })
          return 'Connected to Linear.'
        },
      }),
    },
  }),
})
```

## 3. Keep other people out of a running turn

A message with `busy: 'steer'` can join the turn that runs now. A joined message runs with the credentials of the sender of that turn. So without `turn.canJoin`, a waiting message joins the running turn only when the same person sent both:

- A message from another person waits. It runs as its own turn after the running one, as its sender.
- The waiting messages join as a prefix, in the order they arrived. So a message that waits also holds back the messages that wait after it.

Set `canJoin` to choose your own rule. It gets the sender of the waiting message as `principal`, and the sender of the running turn as `turnPrincipal`. This harness keeps the default rule, and it also lets your build bot join any turn:

```ts group=harness-shared-threads
export const team = defineHarness({
  name: 'acme/team',
  adapter: openaiText('gpt-5.6'),
  turn: {
    canJoin: ({ principal, turnPrincipal }) =>
      principal?.id === 'build-bot' ||
      (principal?.id === turnPrincipal?.id &&
        principal?.tenantId === turnPrincipal?.tenantId),
  },
})
```

A background agent that a turn starts keeps the provider key of the sender of that turn. It keeps the key also after the turn ends. The wake turn after the agent runs as the person who started the agent.

One limit applies to code that runs after its turn ended, for example a tool of a background agent. That code reads `ctx.credentials` and `ctx.session.principal` of the turn that runs at that time. In an agent, use `ctx.keys`. In a command, use the `credentials` of its `run` context.

## 4. Keep organizations apart

The credential scope of a turn has the `userId` and the `tenantId` of the sender. So one person in two organizations has two sets of credentials. The memory store of `memoryPersistence()` keeps them apart. In your own credential store, put `scope.tenantId` in the key:

```ts group=harness-shared-threads
import type { Scope } from '@tanstack/ai'

export const keyOf = (scope: Scope, id: string) =>
  `${scope.tenantId ?? '-'}:${scope.userId ?? '-'}:${id}`
```

Use `keyOf` in `get`, `set`, `delete`, and `list` of the store in [Keep credentials](./auth#keep-credentials).

### Share one credential with the whole organization

Some services have one key for the whole organization, for example a company account. Save that key once, with no `userId`. Every user of the tenant can then use it:

```ts group=harness-shared-threads
import type { CredentialStore } from '@tanstack/ai-persistence'

// Your admin code. A credential without a userId belongs to the tenant.
export async function shareKey(
  store: CredentialStore,
  tenantId: string,
  value: string,
) {
  await store.set({ threadId: 'admin', tenantId }, 'linear', {
    type: 'api_key',
    value,
  })
}
```

The store keys credentials by user and tenant, so the `threadId` of this scope has no effect.

- A turn reads the credential of its sender first. If the sender has none, the turn reads the credential of the tenant.
- A save from a turn goes to the sender only. This includes `connect:<id>` and `ctx.credentials.set`. The credential of the tenant does not change.
- `ctx.credentials.list()` shows the credentials of the sender and of the tenant. For the same id, the credential of the sender wins.
- Use an API key for a credential of the tenant. If the turn refreshes an OAuth token of the tenant, the new token goes to the sender only.

## What you have now

- Each message runs as the person who sent it, also after a restart.
- Tools and model calls use the credentials and the provider key of the sender.
- A message from another person waits for its own turn.
- Sign-ins and keys belong to the person who saved them.
- The credentials of two organizations stay apart, and one key can serve a whole organization.
