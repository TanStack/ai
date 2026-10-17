---
title: Access and tenants
id: harness-access
order: 3
description: "Decide who can use each session of a harness. Read the user of each request, check each action, and keep the threads of each organization apart."
keywords:
  - tanstack ai
  - harness
  - access
  - identify
  - authorize
  - tenantId
  - membersOnly
---

Your harness serves many users. Ada must not read the threads of Bob, and the company Acme must never see a thread of the company Globex. Give the host `access`. Then the host reads the user of each request, asks you about each action, and keeps each organization apart.

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
    identify: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    authorize: membersOnly(),
  },
})

export const handler = createHarnessHandler({ host, harness: assistant })
```

- `identify` reads the user of a request with your own login check. Return `null` to refuse the request with `401`.
- `authorize` decides each action. `membersOnly()` lets only the members of a session use it. See [Share a thread between people](./shared-threads).
- `memoryPersistence()` has a `sessions` store. Without `stores.sessions`, `createHarnessHost` throws.

The handler gets the user from `identify`, so it needs no login option of its own. A new thread belongs to the user who opens it first.

## 2. Write your own rule

`authorize` gets the user, the action, and the session. Return `false` to refuse. The user has the type that `identify` returns, so your own fields are typed too:

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
    identify: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    authorize: ({ principal, action, session }) => {
      const isOwner = session.ownerId === principal.id
      if (isOwner || principal.isAdmin) return true
      // Everyone in the organization can read every thread of it.
      return action === 'read' || action === 'list'
    },
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
| `cancel` | Stop a run, or drop an input that waits. |
| `configure` | Change the thread settings, the plugin config, the title, and the metadata. |
| `share` | Add or remove members. |
| `delete` | Remove the session from the index. |
| `fork` | Copy the session into a new session. |
| `transfer` | Give the session to a new owner. |

- For `answer` and `cancel`, `authorize` also gets `run`: the `runId` and the `principalId` of the user who started that run.
- For `cancelSchedule`, `run` is the schedule: the `runId` is the schedule id, and the `principalId` is the user who made it.
- `host.submit` and `schedule` check an answer or a cancel when you send it, with `run` from the log. A run that the log does not have is refused with `unknown_run`: `submit` returns a `rejected` receipt, and `schedule` throws `InputRejectedError`.
- A handle checks `read` once, when it opens. Each action that changes the session asks `authorize` again.

## What the host checks for you

`authorize` decides only the rule of your app. The host does these checks before it calls it:

- The tenant. A user reaches only the sessions of their own tenant. `authorize` never gets a session of another tenant.
- A user on every call. With access, `host.open`, `host.fork`, and each `host.sessions` method need a `principal`. A call without one throws.
- One user per handle. `host.open` returns a session that acts only as its `principal`. A call on it that passes another `principal` throws.
- Child threads. The host checks a subagent child as its root thread, so `session` is the root session.
- Missing threads. A read of a thread with no entry answers `404` and starts no session. `GET run?threadId=` answers an empty hydration instead, because `useChat` reads it before the first message.

A refused action throws `AccessDeniedError`, with `code: 'forbidden'`, the `action`, and the `threadId`. The handler answers it with `403`.

The host keeps only the `id` and the `tenantId` of a user, in the log and in signed media URLs. So `authorize` can get a user with only these two fields, for example when the handler serves a signed media URL. A rule that reads another field, such as `isAdmin` above, must refuse when the field is missing.

## Keep tenants apart

Give each user a `tenantId` in `identify`. The tenant keeps each organization apart:

- One `threadId` in two tenants is two sessions, with two index entries and two logs.
- `host.sessions.list` reads one tenant: the tenant of `principal`. A user with no `tenantId` is in the default tenant.
- The log store keeps each session tree under `logIdOf({ tenantId, logId })`, for example `acme:thread-1`. The default tenant gives `:thread-1`. Use `logIdOf` when you read a log yourself.
- The credentials of a user are kept per tenant. See [Keep organizations apart](./shared-threads#7-keep-organizations-apart).

## Call the host from code with no request

A cron job, an admin tool, or a queue worker has no request, so `identify` cannot run. Pass the user yourself. The host checks the action for that user, the same as for a request:

```ts group=harness-access
// Your database knows the owner of each thread.
export async function nightlyReport(threadId: string, owner: { id: string; tenantId: string }) {
  const session = await host.open(assistant, { threadId, principal: owner })
  await session.send('Write the report of today.')
}
```

Your own routes and an MCP server have a request. Read its user with `host.identify`:

```ts group=harness-access
export async function myThreads(request: Request) {
  const principal = await host.identify({ request })
  if (!principal) return new Response('Unauthorized', { status: 401 })
  const page = await host.sessions.list({ principal, limit: 20 })
  return Response.json(page.entries.map((entry) => entry.title ?? 'New chat'))
}
```

`host.identify` throws on a host with no `access`.

## Use your own access tables

Your app already keeps who can use each thread, for example a table of teams. Read it in `authorize`. When you take a user out of the table, call `host.revoke`:

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
    identify: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    authorize: ({ principal, session }) =>
      session.ownerId === principal.id || (teams.get(session.threadId)?.has(principal.id) ?? false),
  },
})

export function removeFromTeam(threadId: string, user: { id: string; tenantId: string }) {
  teams.get(threadId)?.delete(user.id)
  host.revoke({ threadId, principal: user })
}
```

After `host.revoke`:

- The streams of the user on the thread close. A socket gets a `forbidden` error frame.
- The open handles of the user on the thread throw `AccessDeniedError`. A new `host.open` asks `authorize` again.
- The signed media URLs of the user stop working. A signed URL names its user, and the handler checks that user again when it serves the file.
- `host.events()` yields a `revoked` event.

`host.sessions.share` and `unshare` work only with `membersOnly()`. With your own tables, change the tables, then call `host.revoke`.

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
  openAccess: { principal: { id: 'ada' } },
})
```

- `openAccess: true`: every request runs with no user, in the default tenant.
- `openAccess: { principal }`: every request runs as that one user. Their credentials and keys do the work.
- Without host `access` and without `openAccess`, `createHarnessHandler` throws at the start. So a server never serves every thread to everyone by mistake.
- On a host with `access`, `openAccess` throws. The host reads the user itself.
- `handleHarnessSocket` takes the same option.

CAUTION: Do not use `openAccess` on a server that the internet can reach. Every caller can then use every thread.

## Use the provider keys of the server

With access, a keyed adapter and `run.keys` read only the keys that each user saved. They do not read the env vars of the server, so a user never spends the key of the server. To let users fall back to the server key, set `envKeys: true` in `access`, next to `identify` and `authorize`. See [Connect model providers](./provider-keys).

## What you have now

- A host that reads the user of each request, and checks each action.
- A rule of your own, typed from what `identify` returns.
- Organizations that never see each other's threads.
- Cron jobs and admin tools that act as a user they name.
- A way to take access away from a user at once.
