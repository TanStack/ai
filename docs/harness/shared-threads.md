---
title: Share a thread between people
id: harness-shared-threads
order: 7
description: "Let a team use one thread. Share it with members and viewers, and run each message as its sender, with the credentials and the provider key of that person."
keywords:
  - tanstack ai
  - harness
  - shared thread
  - membersOnly
  - share
  - tenantId
  - canJoin
---

Several people work in one thread: a team in one chat, or a customer and a support agent. Only the people you invite can see it. A message from Bob must run as Bob: his GitHub token and his provider key do the work, not those of the person who opened the thread. `membersOnly()` gives each thread an owner and a list of members, and the harness runs each message as the person who sent it.

## 1. Turn on members

Use `membersOnly()` as the `authorize` of the host. [Access and tenants](./access) explains `identify`:

```ts group=harness-shared-threads
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

// Your own login check: a session token to a user.
const users = new Map([
  ['Bearer token-ada', { id: 'ada', tenantId: 'acme' }],
  ['Bearer token-bob', { id: 'bob', tenantId: 'acme' }],
])

export const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    identify: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    authorize: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

The user who opens a new thread is its owner. Nobody else can open it until the owner shares it. What each role can do:

| Action | Owner | Member | Viewer |
| --- | --- | --- | --- |
| Read the thread and see it in a list | Yes | Yes | Yes |
| Send messages, run commands, start agents | Yes | Yes | No |
| Answer and cancel | Every run | Only the runs they started | No |
| Answer a `human` wait (`operator`) | Yes | Yes | No |
| Fork | Yes | Yes | No |
| Reply as an [operator](./handoffs#reply-as-the-operator) | Yes | Yes | No |
| Configure, share, delete, transfer | Yes | No | No |

A user who is not a member can do nothing. A child thread of a subagent uses the members of its root thread.

## 2. Share the thread

The owner adds a member from your server code:

```ts group=harness-shared-threads
const ada = { id: 'ada', tenantId: 'acme' }

await host.open(assistant, { threadId: 'team-thread', principal: ada })
await host.sessions.share({
  threadId: 'team-thread',
  userId: 'bob',
  role: 'member',
  principal: ada,
})
```

From the browser, the owner sends the same change to `POST sessions`:

```ts group=harness-shared-threads-invite
export async function invite(userId: string, role: 'member' | 'viewer') {
  const response = await fetch('/api/harness/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token-ada' },
    body: JSON.stringify({ op: 'share', threadId: 'team-thread', userId, role }),
  })
  if (!response.ok) throw new Error(`The share failed with ${response.status}.`)
  return response.json()
}
```

- `share` adds a member, or changes the role of a member. It resolves to the changed entry.
- `unshare` removes a member: `host.sessions.unshare({ threadId, userId, principal })` on the server, or `{ op: 'unshare', threadId, userId }` from the browser.
- Only the owner can share. Another user gets `AccessDeniedError`, and the handler answers `403`.
- The owner cannot be removed.

When `unshare` removes a user:

- The queued and running work that the user started stops, on every host. The log keeps who cancelled it. The schedules of the user on the thread are removed.
- The streams of the user on the thread close. A socket gets a `forbidden` error frame. A running `events()` read of a handle or a view ends with `AccessDeniedError`.
- The open handles and views of the user throw `AccessDeniedError`.
- The signed media URLs of the user stop working.

## 3. Connect each person

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

await ada.send('Open an issue for the login bug.')
await bob.send('List my open pull requests.')
```

Bob sends his message while the turn of Ada runs. His message waits. Then it runs as its own turn, as Bob.

On the server, open one handle for each person. A handle acts only as its user:

```ts group=harness-shared-threads
const bob = { id: 'bob', tenantId: 'acme' }
const bobSession = await host.open(assistant, { threadId: 'team-thread', principal: bob })

await bobSession.send('Summarize the open issues.')
```

## 4. Each message runs as its sender

Each message, command, and agent runs as the person who started it:

- The log keeps the sender of each input, also of a cancel, an answer, and a change of settings. After a restart, a message runs again as its sender.
- Tools and middleware read the run as `ctx.context.run`. It has the user, the credentials, and the provider keys of the sender.
- The model call uses the provider key of the sender. So the sender pays for the call.
- A command runs as the person who runs it. So a sign-in, for example `connect:github`, belongs to the person who signed in.
- A background agent runs as the person who started it, also after the turn ends. The wake turn after the agent runs as that person too.

A tool reads the credentials of the user of its own run:

```ts group=harness-shared-threads
import { toolDefinition } from '@tanstack/ai'
import type { HarnessRunContext } from '@tanstack/ai-harness'

export const myIssues = toolDefinition({
  name: 'my_linear_issues',
  description: 'List the Linear issues of the user',
}).server<HarnessRunContext>(async (_args, ctx) => {
  const credential = await ctx.context.run.credentials.require('linear')
  const key = credential.type === 'api_key' ? credential.value : credential.accessToken
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ viewer { assignedIssues { nodes { title } } } }' }),
  })
  return response.json()
})
```

A command that saves a sign-in or a key saves it with the `credentials` of its run context. Those credentials belong to the person who runs the command:

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
          await credentials.set({
            id: 'linear',
            credential: { type: 'api_key', value: key },
          })
          return 'Connected to Linear.'
        },
      }),
    },
  }),
})
```

The `ctx.credentials` of a plugin `setup` have no user, so each call throws. See [Act as the user of a run](./plugins#act-as-the-user-of-a-run).

Context that a client sends with a message is client data, and it never changes the sender. See [Send context with a message](./inputs#send-context-with-a-message).

## 5. Keep other people out of a running turn

A message with `busy: 'steer'` can join the turn that runs now. A joined message runs with the credentials of the sender of that turn. So without `turn.canJoin`, a waiting message joins the running turn only when the same person sent both:

- A message from another person waits. It runs as its own turn after the running one, as its sender.
- The waiting messages join as a prefix, in the order they arrived. So a message that waits also holds back the messages that wait after it.

Set `canJoin` to choose your own rule. It gets the sender of the waiting message as `principal`, and the sender of the running turn as `turnPrincipal`. This harness keeps the default rule, and it also lets your build bot join any turn:

```ts group=harness-shared-threads
export const team = defineHarness({
  name: 'acme/team',
  adapter: openaiText('gpt-6.1-sol'),
  turn: {
    canJoin: ({ principal, turnPrincipal }) =>
      principal?.id === 'build-bot' ||
      (principal?.id === turnPrincipal?.id &&
        principal?.tenantId === turnPrincipal?.tenantId),
  },
})
```

## 6. Fork a shared thread

Bob wants to try another path without changing the thread of the team. He forks it. The user who forks owns the fork:

```ts group=harness-shared-threads
const [first] = await bobSession.transcript()
if (!first?.id) throw new Error('The thread has no messages.')

const fork = await host.sessions.fork({
  harness: assistant,
  threadId: 'team-thread',
  at: { through: first.id },
  members: 'all',
  principal: bob,
})
console.log(fork.ownerId) // 'bob'
```

`members` picks who else is in the fork:

- `'self'`: only the user who forks.
- `'all'`: the members of the old thread keep their roles. The old owner becomes a `member`.

Without `members`, the fork uses `fork.members` of `membersOnly()`, and the default is `'self'`. To change it for every fork, pass `membersOnly({ fork: { members: 'all' } })`.

## 7. Keep organizations apart

The tenant of a user picks the thread. One `threadId` in two tenants is two threads, so Acme and Globex never see each other's work. See [Keep tenants apart](./access#keep-tenants-apart).

The credential scope of a run has the `userId` and the `tenantId` of its user. So one person in two organizations has two sets of credentials. The memory store of `memoryPersistence()` keeps them apart. In your own credential store, put `scope.tenantId` in the key:

```ts group=harness-shared-threads
import type { Scope } from '@tanstack/ai'

export const keyOf = (scope: Scope, id: string) =>
  `${scope.tenantId ?? '-'}:${scope.userId ?? '-'}:${id}`
```

Use `keyOf` in `get`, `set`, `delete`, and `list` of the store in [Keep credentials](./auth#keep-credentials).

### Share one credential with the whole organization

Some services have one key for the whole organization, for example a company account. Save that key once, with no `userId`. Every user of the tenant can then use it:

```ts group=harness-shared-threads
import type { CredentialStore } from '@tanstack/ai/byok'

// Your admin code. A credential without a userId belongs to the tenant.
export async function shareKey(
  store: CredentialStore,
  tenantId: string,
  value: string,
) {
  await store.set({
    scope: { tenantId },
    id: 'linear',
    credential: { type: 'api_key', value },
  })
}
```

- A run reads the credential of its user first. If the user has none, the run reads the credential of the tenant.
- A save from a run goes to its user only. This includes `connect:<id>` and `run.credentials.set`. The credential of the tenant does not change.
- `run.credentials.list()` shows the credentials of the user and of the tenant. For the same id, the credential of the user wins.
- An OAuth token of the tenant works too. A refresh saves the new token for the tenant, so every user of the tenant gets it. See [Refresh a token](./auth#refresh-a-token).

## What you have now

- Threads that only their members can see, with an owner, members, and viewers.
- Each message runs as the person who sent it, also after a restart.
- Tools and model calls use the credentials and the provider key of the sender.
- A message from another person waits for its own turn.
- Forks that the forker owns, with the members you pick.
- The threads and credentials of two organizations stay apart.
