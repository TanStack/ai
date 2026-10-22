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
  - logger
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

This host keeps everything in memory. When the process stops, the sessions are gone. At the start, the host writes one warning about this to its [`logger`](#send-the-warnings-to-your-own-logger) (the console by default). There is no login check, so every call acts for the one local user.

## Find the options that you need

Find your situation below. Add only the options of that situation.

Most servers need these two first:

- **The sessions must stay after a restart.** Add `persistence`. See [Durable sessions](./durable-sessions).
- **More than one person uses the app.** Add `access`. Each call then needs the `user` that it acts for. See [Access and tenants](./access).

The other options are for some apps only:

- **You run more than one server.** Give every server the same `persistence`. If your agents use files on the disk of a server, add `ownership`. See [Deploy a harness](./deploy#run-more-than-one-server).
- **Users bring their own API keys.** Add `credentials`, so the keys stay after a restart. See [Where the keys are stored](./provider-keys#where-the-keys-are-stored).
- **You want traces and metrics.** Add `observability`. See [Trace runs and report operations](./deploy#trace-runs-and-report-operations).
- **You want the warnings in your own logger.** Add `logger`, for example in a full-screen terminal UI. See [Send the warnings to your own logger](#send-the-warnings-to-your-own-logger).

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

## Send the warnings to your own logger

By default, the harness writes its warnings and errors to the console. In a full-screen terminal UI, these lines break the screen. On a server, they do not match the format of your other logs. Give the host your own `logger`. This one writes each line to a file:

```ts group=harness-host-options-logger
import { appendFileSync } from 'node:fs'
import { inspect } from 'node:util'
import { createHarnessHost } from '@tanstack/ai-harness'

// Write each line to a file, so the terminal UI keeps its screen.
function toFile(level: string, message: string, meta?: Record<string, unknown>) {
  // An error in the meta prints with its stack.
  const details = meta ? ` ${inspect(meta)}` : ''
  appendFileSync('harness.log', `${new Date().toISOString()} ${level} ${message}${details}\n`)
}

const host = createHarnessHost({
  logger: {
    debug: (message, meta) => toFile('debug', message, meta),
    info: (message, meta) => toFile('info', message, meta),
    warn: (message, meta) => toFile('warn', message, meta),
    error: (message, meta) => toFile('error', message, meta),
  },
})
```

`logger` takes a `Logger` from `@tanstack/ai`. Its four methods are `debug`, `info`, `warn`, and `error`. Each method gets a message and an optional meta object. The harness puts an error in the meta as `{ error }`. On Node, the default `new ConsoleLogger()` prints the meta with `console.dir`.

On a server, call your own logger in each method. This one uses pino:

```ts group=harness-host-options-pino
import pino from 'pino'
import { createHarnessHost } from '@tanstack/ai-harness'

// pino prints the stack of an error only under its `errorKey`, `err` by default.
// The harness puts the error under `error`.
const log = pino({ errorKey: 'error' })

const host = createHarnessHost({
  logger: {
    debug: (message, meta) => log.debug(meta, message),
    info: (message, meta) => log.info(meta, message),
    warn: (message, meta) => log.warn(meta, message),
    error: (message, meta) => log.error(meta, message),
  },
})
```

The harness writes these to your logger:

- Every warning and error of the host and its sessions, also from `createHarnessWorker` and `createHarnessHandler`.
- The errors of the model calls of a session: the turn, `ctx.model.chat`, and the calls of child agents. These calls write no other [debug output](../advanced/debug-logging).
- The warnings of plugins, for example `mcp()`, `codeMode()`, and `skills()`. A plugin writes to your logger with `ctx.logger`. See [Write warnings to the host logger](./plugins#write-warnings-to-the-host-logger).

If a method of your logger throws, or returns a promise that rejects, that line is lost. The harness goes on.

## All options

Each option is optional. Leave out an option to get its default.

| Option | What it does | Default | Read more |
| --- | --- | --- | --- |
| `persistence` | Where the host saves the state of each session. | In memory. Lost when the process stops. | [Durable sessions](./durable-sessions) |
| `access` | Who can use which session. `getUser` finds the user of a request. `rules` decide what that user can do. | No checks. One user. | [Access and tenants](./access) |
| `acceptInput` | Checks each input after `access`, before the log keeps it. It can change the input or refuse it. | Every input is stored as it came. | [Check an input on the server](./inputs#check-an-input-on-the-server) |
| `credentials` | Where the API keys and sign-in tokens of your users are saved. | In memory. | [Connect model providers](./provider-keys#where-the-keys-are-stored) |
| `log` | How often the host writes streamed text to the log, and when it saves a snapshot. | Text every 100 ms. A snapshot after 1 MB or 5 minutes. | [Session log](./session-log#tune-how-text-streams-into-the-log) |
| `ownership` | How servers share the sessions. One server runs a session at a time. | Ownership lasts 30 s and renews every 10 s. Sessions are not pinned to a server. | [Durable sessions](./durable-sessions#one-host-drives-a-thread) |
| `lifecycle` | When the host closes idle sessions, how many stay open, and how much each keeps in memory. | Close after 60 s idle. At most 500 open. | [Lifecycle and retention](./lifecycle) |
| `observability` | Sends traces to OpenTelemetry. Also calls you when each turn, agent run, and command starts and ends. | No traces. | [Deploy a harness](./deploy#trace-runs-and-report-operations) |
| `logger` | Where the harness writes its warnings and errors. Plugins write to it with `ctx.logger`. | `new ConsoleLogger()`: the console. | [Send the warnings to your own logger](#send-the-warnings-to-your-own-logger) |
| `presence` | Calls you when a client connects to a session, and when it disconnects. | No calls. | [Share a thread](./shared-threads#8-show-who-is-here) |
| `harnesses` | The harnesses whose sessions this host can delete without opening them first. | Only the harnesses that this host opened. | [Delete a thread for good](./lifecycle#delete-a-thread-for-good) |

Some words in this table:

- **Log:** the record of everything that happened in a session. The host reads it again after a restart.
- **Snapshot:** a saved copy of the state of a session, so the host does not read the full log to open it.
- **Tenant:** an organization in your app. With `access`, the sessions of one tenant stay apart from the sessions of other tenants.

## What you have now

You know which options your app needs. A local app runs with `createHarnessHost()`. A server adds `persistence` and `access` first, and more options only when it needs them.
