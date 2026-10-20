---
title: Host options
id: harness-host-options
order: 1
description: "Every option of createHarnessHost in one place: what it does, its default, and when you need it. A local app needs none of them."
keywords:
  - tanstack ai
  - harness
  - createHarnessHost
  - host options
  - configuration
---

`createHarnessHost` has many options, and their names do not always tell you if you need them. Most apps need only one or two. A local app, like a coding agent on your own computer, needs none.

The host is the part of your server that runs the sessions. A session is one conversation with your agent. The host keeps the state of each session, runs its turns, and gives clients its events.

## Start with no options

On your own computer, with one user, create the host with no options:

```ts group=harness-host-options-local
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost()

await using session = await host.open(assistant, { threadId: 'my-first-chat' })
const turn = await session.send('Hello!')
console.log(turn.text)
```

This host keeps everything in memory. When the process stops, the sessions are gone, and the host prints one warning about this at the start. There is no login check, so every call acts for the one local user.

## Find the options that you need

Find your situation below. Add only the options of that situation.

- **The sessions must stay after a restart.** Add `persistence`. See [Durable sessions](./durable-sessions).
- **More than one person uses the app.** Add `access`. Each call then needs the `user` that it acts for. See [Access and tenants](./access).
- **You run more than one server.** Give every server the same `persistence`. If your agents use files on the disk of a server, add `ownership`. See [Deploy a harness](./deploy#run-more-than-one-server).
- **Users bring their own API keys.** Add `credentials`, so the keys stay after a restart. See [Where the keys are stored](./provider-keys#where-the-keys-are-stored).
- **You want traces and metrics.** Add `observability`. See [Trace runs and report operations](./deploy#trace-runs-and-report-operations).

A server for many users usually starts like this:

```ts group=harness-host-options-server
import { createHarnessHost, membersOnly } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({
  // Use a store on your own database in production.
  persistence: memoryPersistence(),
  access: {
    // Your own login check. Return null when nobody is logged in.
    getUser: async ({ request }) => {
      const id = request.headers.get('x-user-id')
      return id ? { id } : null
    },
    rules: membersOnly(),
  },
})
```

## All options

Each option is optional. Leave out an option to get its default.

| Option | What it does | Default | Read more |
| --- | --- | --- | --- |
| `persistence` | Where the host saves the state of each session. | In memory. Lost when the process stops. | [Durable sessions](./durable-sessions) |
| `access` | Who can use which session. `getUser` finds the user of a request. `rules` decide what that user can do. | No checks. One user. | [Access and tenants](./access) |
| `credentials` | Where the API keys and sign-in tokens of your users are saved. | In memory. | [Connect model providers](./provider-keys#where-the-keys-are-stored) |
| `log` | How often the host writes streamed text to the log, and when it saves a snapshot. | Text every 100 ms. A snapshot after 1 MB or 5 minutes. | [Session log](./session-log#tune-how-text-streams-into-the-log) |
| `ownership` | How servers share the sessions. One server runs a session at a time. | Ownership lasts 30 s and renews every 10 s. Sessions are not pinned to a server. | [Durable sessions](./durable-sessions#one-host-drives-a-thread) |
| `lifecycle` | When the host closes idle sessions, how many stay open, and how much each keeps in memory. | Close after 60 s idle. At most 500 open. | [Lifecycle and retention](./lifecycle) |
| `observability` | Sends traces to OpenTelemetry. Also calls you when each turn, agent run, and command starts and ends. | No traces. | [Deploy a harness](./deploy#trace-runs-and-report-operations) |
| `presence` | Calls you when a client connects to a session, and when it disconnects. | No calls. | [Share a thread](./shared-threads#8-show-who-is-here) |
| `harnesses` | The harnesses whose sessions this host can delete without opening them first. | Only the harnesses that this host opened. | [Delete a thread for good](./lifecycle#delete-a-thread-for-good) |

Some words in this table:

- **Log:** the record of everything that happened in a session. The host reads it again after a restart.
- **Snapshot:** a saved copy of the state of a session, so the host does not read the full log to open it.
- **Tenant:** an organization in your app. With `access`, the sessions of one tenant stay apart from the sessions of other tenants.

## What you have now

You know which options your app needs. A local app runs with `createHarnessHost()`. A server adds `persistence` and `access` first, and more options only when it needs them.
