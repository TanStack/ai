---
title: Access and tenants
id: harness-access
order: 3
description: "Decide who can use each session of a harness. Read the user of each request, check each action, and keep the threads of each organization apart."
keywords:
  - tanstack ai
  - harness
  - access
  - getUser
  - isAllowed
  - tenantId
  - membersOnly
---

Your harness serves many users. Ada must not read the threads of Bob, and the company Acme must never see a thread of the company Globex. Give the host `access`. Then the host reads the user of each request, asks you about each action, and keeps each organization apart.

A user here is `{ id, name?, tenantId? }`: who a call acts for. Its type is `HarnessUser`.

## 1. Turn on access

Give `createHarnessHost` an `access` object and a `sessions` store. The store keeps the owner and the members of each session:

```ts group=harness-access
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
  ['Bearer token-gus', { id: 'gus', tenantId: 'globex' }],
])

export const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    rules: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

- `getUser` reads the user of a request with your own login check. Return `null` to refuse the request with `401`.
- `rules` decides each action. `membersOnly()` gives ready rules: only the members of a session can use it. See [Share a thread between people](./shared-threads).
- `memoryPersistence()` has a `sessions` store. Without `stores.sessions`, `createHarnessHost` throws.

The handler gets the user from `getUser`, so it needs no login option of its own. A new thread belongs to the user who opens it first.

## 2. Write your own rule

Give `access` your own `rules` with an `isAllowed` function. `isAllowed` gets the user, the action, and the session. Return `false` to refuse. The user has the type that `getUser` returns, so your own fields are typed too:

```ts group=harness-access-rule
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

interface User {
  id: string
  tenantId: string
  isAdmin: boolean
}

const users = new Map<string, User>([
  ['Bearer token-ada', { id: 'ada', tenantId: 'acme', isAdmin: false }],
  ['Bearer token-eve', { id: 'eve', tenantId: 'acme', isAdmin: true }],
])

export const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    rules: { isAllowed: ({ user, action, session }) => {
      const isOwner = session.members.some(
        (member) => member.userId === user.id && member.role === 'owner',
      )
      if (isOwner || user.isAdmin) return true
      // Everyone in the organization can read every thread of it.
      return action === 'read' || action === 'list'
    } },
  },
})
```

Each action covers these calls:

| Action | What it covers |
| --- | --- |
| `read` | Open the session, and read its stream, snapshot, transcript, media, and child runs. |
| `list` | See the session in `host.sessions.list`. |
| `send` | Prompt, steer, follow up, run a command or a tool, start an agent, and upload media. |
| `answer` | Answer a question or an approval. |
| `operator` | Reply as an operator with `send(text, { as: 'operator' })`, and answer a `human` wait of any run. See [Hand off to a person](./handoffs#4-hand-off-to-a-person). |
| `cancel` | Stop a run, or drop an input that waits. |
| `configure` | Change the thread settings, the plugin config, the title, and the metadata. |
| `share` | Add or remove members. |
| `delete` | Remove the session from the index. |
| `fork` | Copy the session into a new session. |
| `transfer` | Move the conversation to another thread, also of another harness, with `host.transfer`. See [Move a conversation to another harness](./handoffs#5-move-a-conversation-to-another-harness). |

- For `answer` and `cancel`, `isAllowed` also gets `run`: the `runId` and the `userId` of the user who started that run.
- For `answer` and `operator`, `isAllowed` also gets `wait`: the `waitId` and the `kind` of the [wait](./waits) that the input answers, when the host knows it. A `human` wait takes only `operator`, also for a resolve that ends it.
- For `cancelSchedule`, `run` is the schedule: the `runId` is the schedule id, and the `userId` is the user who made it.
- `host.submit` and `schedule` check an answer or a cancel when you send it, with `run` from the log. A run that the log does not have is refused with `unknown_run`: `submit` returns a `rejected` receipt, and `schedule` throws `InputRejectedError`.
- A handle checks `read` once, when it opens. Each action that changes the session asks `isAllowed` again. This includes `cancel` and `send` on an operation or an agent run that the handle returns.

The rules have two more keys. `membersOnly()` sets both. Your own rules can leave them out:

- `filterSessionList`: the filter that `host.sessions.list` gives the store, for example `{ memberId }`. Without it, the store reads every session of the tenant, and `isAllowed` drops the others, so a page can have fewer entries than `limit`.
- `members`: turns on `host.sessions.share` and `unshare`, and `members.fork` sets the members of a fork. Without it, `share` and `unshare` throw.

## What the host checks for you

`isAllowed` decides only the rule of your app. The host does these checks before it calls it:

- The tenant. A user reaches only the sessions of their own tenant. `isAllowed` never gets a session of another tenant.
- A user on every call. With access, `host.open`, `host.fork`, `host.transfer`, and each `host.sessions` method need a `user`. A call without one throws.
- One user per handle. `host.open` returns a session that acts only as its `user`. A call on it that passes another `user` throws.
- Child threads. The host checks a subagent child as its root thread, so `session` is the root session. A user who cannot read the root gets `403` for the child, and does not learn its root.
- Missing threads. A read of a thread with no entry answers `404` and starts no session. `GET run?threadId=` answers an empty hydration instead, because `useChat` reads it before the first message.

A refused action throws `AccessDeniedError`, with `code: 'forbidden'`, the `action`, and the `threadId`. The handler answers it with `403`.

The host keeps only the `id` and the `tenantId` of a user in the log. So `isAllowed` can get a user with only these two fields. A rule that reads another field, such as `isAdmin` above, must refuse when the field is missing.

A signed media URL is no login. The handler runs `getUser` for it too, and checks `read` for that user, in the tenant of the URL. A request with no user gets `401`. So load the file with a request that sends the login, for example an `<img>` on the same site, which sends its cookies.

### Serve media to a request with no login

An `<img>` on another site sends no cookies, so `getUser` finds no user. Give `access` a `getGuestUser` function. It returns a guest for that request, and `isAllowed` decides `read` for the guest:

```ts group=harness-access-guest
import { createHarnessHost, membersOnly } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

interface User {
  id: string
  tenantId?: string
  isGuest?: boolean
}

const members = membersOnly()

export const host = createHarnessHost<User>({
  persistence: memoryPersistence(),
  access: {
    getUser: () => null,
    // `tenantId` is the tenant of the signed URL.
    getGuestUser: ({ tenantId }) => ({ id: 'guest', tenantId, isGuest: true }),
    rules: {
      isAllowed: (input) =>
        input.user.isGuest === true ? input.action === 'read' : members.isAllowed(input),
      filterSessionList: members.filterSessionList,
      members: members.members,
    },
  },
})
```

- The handler calls `getGuestUser` only for a signed media URL, after the signature checks out, and only when `getUser` finds no user.
- The guest gets nothing else. Every other route still needs a user from `getUser`.
- Without `getGuestUser`, or when it returns `null`, the request gets `401`.
- The guest needs the tenant of the URL, else the request gets `403`.

## Keep tenants apart

Give each user a `tenantId` in `getUser`. The tenant keeps each organization apart:

- One `threadId` in two tenants is two sessions, with two index entries and two logs.
- `host.sessions.list` reads one tenant: the tenant of `user`. A user with no `tenantId` is in the default tenant.
- The log store keeps each session tree under `logIdOf({ tenantId, logId })`, for example `acme:thread-1`. The default tenant gives `:thread-1`. Use `logIdOf` when you read a log yourself.
- The credentials of a user are kept per tenant. See [Keep organizations apart](./shared-threads#7-keep-organizations-apart).

## Call the host from code with no request

A cron job, an admin tool, or a queue worker has no request, so `getUser` cannot run. Pass the user yourself. The host checks the action for that user, the same as for a request:

```ts group=harness-access
// Your database knows the owner of each thread.
export async function nightlyReport(threadId: string, owner: { id: string; tenantId: string }) {
  const session = await host.open(assistant, { threadId, user: owner })
  await session.send('Write the report of today.')
}
```

Your own routes and an MCP server have a request. Read its user with `host.getUserOfRequest`:

```ts group=harness-access
export async function myThreads(request: Request) {
  const user = await host.getUserOfRequest({ request })
  if (!user) return new Response('Unauthorized', { status: 401 })
  const page = await host.sessions.list({ user, limit: 20 })
  return Response.json(page.entries.map((entry) => entry.title ?? 'New chat'))
}
```

`host.getUserOfRequest` throws on a host with no `access`.

## Use your own access tables

Your app already keeps who can use each thread, for example a table of teams. Read it in `isAllowed`. When you take a user out of the table, call `host.revoke`:

```ts group=harness-access-own-tables
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const users = new Map([
  ['Bearer token-ada', { id: 'ada', tenantId: 'acme' }],
  ['Bearer token-bob', { id: 'bob', tenantId: 'acme' }],
])

// Your own table: the team of each thread.
const teams = new Map([['plan-q3', new Set(['ada', 'bob'])]])

export const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    rules: { isAllowed: ({ user, session }) =>
      session.members.some((member) => member.userId === user.id) ||
      (teams.get(session.threadId)?.has(user.id) ?? false) },
  },
})

export async function removeFromTeam(threadId: string, user: { id: string; tenantId: string }) {
  teams.get(threadId)?.delete(user.id)
  await host.revoke({ threadId, user })
}
```

When the promise of `host.revoke` resolves:

- The running and queued work of the user on the thread is cancelled, on every host. The schedules of the user on the thread are removed.
- The streams of the user on the thread close. A socket gets a `forbidden` error frame. A running `events()` read of a handle or a view ends with `AccessDeniedError`.
- The open handles and views of the user on the thread throw `AccessDeniedError`. A new `host.open` asks `isAllowed` again.
- The signed media URLs stop working for the user. The handler checks the user of each request again when it serves the file.
- `host.events()` yields a `revoked` event.

When the cancels cannot be sent (for example, the log store fails), the promise rejects. The access is gone already. Call `host.revoke` again to stop the work. `host.sessions.unshare` rejects the same way, after it removed the member.

`host.sessions.share` and `unshare` need `members` in the rules, which `membersOnly()` has. With your own tables, change the tables, then call `host.revoke`.

## Serve with no login

A demo, or a tool on your own machine, has no login. Give the handler `openAccess` on a host with no `access`:

```ts group=harness-access-open
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

// One user on this machine: every request runs as Ada.
export const handler = createHarnessHandler({
  host,
  harness: assistant,
  openAccess: { user: { id: 'ada' } },
})
```

- `openAccess: true`: every request runs with no user, in the default tenant.
- `openAccess: { user }`: every request runs as that one user. Their credentials and keys do the work.
- Without host `access` and without `openAccess`, `createHarnessHandler` throws at the start. So a server never serves every thread to everyone by mistake.
- On a host with `access`, `openAccess` throws. The host reads the user itself.
- `handleHarnessSocket` takes the same option.

CAUTION: Do not use `openAccess` on a server that the internet can reach. Every caller can then use every thread.

## Use the provider keys of the server

With access, a keyed adapter and `run.keys` read only the keys that each user saved. They do not read the env vars of the server, so a user never spends the key of the server. To let users fall back to the server key, set `allowServerEnvKeys: true` in `access`, next to `getUser` and `policy`. See [Connect model providers](./provider-keys).

## What you have now

- A host that reads the user of each request, and checks each action.
- A rule of your own, typed from what `getUser` returns.
- Organizations that never see each other's threads.
- Cron jobs and admin tools that act as a user they name.
- A way to take access away from a user at once.
