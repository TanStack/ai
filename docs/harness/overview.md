---
title: Build your first harness
id: harness-overview
order: 1
description: "Keep one agent conversation alive across many turns. Queue or steer messages while it works, run typed agents from code, and add plugins."
keywords:
  - tanstack ai
  - harness
  - defineHarness
  - session
  - plugins
  - agents
---

`chat()` answers one request. A coding agent, a support bot, or a media studio needs more: one conversation that stays open, takes new messages while it works, and runs other agents from code. A harness gives you that. You define it once with the same options as `chat()`, then open a session for each conversation.

At the end of this page you have a session that answers prompts, queues and steers messages, runs a typed agent, and loads a plugin.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai

<!-- ::end:tabs -->

## Which import to use

Import each name from the entry that holds it. Only four entries load Node modules: `plugins/node`, `plugins/coding`, `build`, and `worker`. All other entries also load on an edge runtime. One exception at run time: the loopback helpers of `oauth` (`startLoopbackReceiver` and `loopbackLogin`) start a local Node server, so call them only on Node.

For your app and its routes:

| Import | Holds |
| --- | --- |
| `@tanstack/ai-harness` | `defineHarness`, `createHarnessHost`, `definePlugin`, `durableTool`, `harnessText`, `oauthConnector`, and the session and agent types. |
| `@tanstack/ai-harness/server` | `createHarnessHandler` and `handleHarnessSocket`. For your own transport: `applyInput`, `parseHarnessInput`, `parseControlFrame`, `capabilitiesOf`, and `HARNESS_PROTOCOL_VERSION`. |
| `@tanstack/ai-harness/client` | `createHarnessClient`, a typed client for a browser or another process. |
| `@tanstack/ai-harness/view` | `createSessionView`, the live state of a session for a UI. |

For plugins:

| Import | Holds |
| --- | --- |
| `@tanstack/ai-harness/plugins` | The first-party plugins that load no Node module: `permissions`, `modelPicker`, `todos`, `goal`, `providerKeys`, and more. |
| `@tanstack/ai-harness/plugins/node` | The first-party plugins that read files. Node only: `agents`, `builtInAgents`, `fileCommands`, `projectInstructions`, and `boundToolOutput`. |
| `@tanstack/ai-harness/plugins/coding` | The coding tools. Node only: `workspaceTools`, `snapshots`, and `formatter`. |

For helpers and builds:

| Import | Holds |
| --- | --- |
| `@tanstack/ai-harness/oauth` | The OAuth helpers: `loopbackLogin`, `deviceLogin`, `exchangeCode`, `refreshCredential`, and more. |
| `@tanstack/ai-harness/media` | The media helpers: `mediaPart`, `mediaOfMessage`, `MediaError`, and more. |
| `@tanstack/ai-harness/build` | `buildHarness` and `artifactText`, to ship a harness as a worker. Node only. |
| `@tanstack/ai-harness/worker` | `runHarnessWorker`, which runs a harness on stdin and stdout. Node only. |

## 1. Define the harness

`defineHarness` takes the `chat()` options you know (`adapter`, `systemPrompts`, `tools`, `middleware`, `subagents`), plus a `name`. Importing it starts nothing.

```ts group=harness-first
import { defineAgent } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const pricer = defineAgent({
  name: 'pricer',
  description: 'Looks up the price of a vendor plan',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => ({ vendor: ctx.input.vendor, cents: 1200 }),
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: ['You are a helpful assistant.'],
  agents: [pricer],
})
```

`agents` are agents you run from code. Put an agent in `subagents` instead when the model must call it as a tool, the same as in `chat()`.

To ship the harness to users with no `.env` file, let each user connect their own key. See [Connect model providers](./provider-keys).

## 2. Open a session

A host runs sessions. Give it the stores from `@tanstack/ai-persistence`, then open a session for a conversation id.

```ts group=harness-first
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })
```

Opening the same `threadId` again gives another handle to the same live session. Release a handle with `await session.close()`, or open it with `await using`, so an idle session can close. See [Lifecycle and retention](./lifecycle).

Does the host serve many users? Give it `access`, so each user reaches only their own sessions. See [Access and tenants](./access).

To see every option of `createHarnessHost`, and which ones your app needs, see [Host options](./host-options).

## 3. Send a message

`send` returns an operation. Await it for the text of the turn.

```ts group=harness-first
const turn = await session.send('Write a haiku about the sea.')
console.log(turn.text)
```

The session saves the transcript, so the next message continues the same conversation.

Want the words as they arrive? Give the operation a listener for the event type you care about:

```ts group=harness-first
const next = session.send('Now one about the mountains.')
next.onEvent('TEXT_MESSAGE_CONTENT', ({ event }) => {
  process.stdout.write(event.delta)
})
await next
```

The events are standard AG-UI events, and `event` has the type you asked for. To listen to every operation of the session, see [React to events](./sessions#react-to-events).

## 4. Send messages while it works

Users type while the agent works. Pick what a new message does:

- `session.send(text)`: runs after the current turn. This is the default.
- `session.send(text, { busy: 'reject' })`: refuses the message while a turn runs.
- `session.send(text, { mode: 'steer' })`: adds the message to the running turn, before its next model call. The operation ends with that turn.
- `session.send(text, { mode: 'followUp' })`: runs after all current work.

Each call returns an operation. `await operation.receipt` resolves when the session stored the message.

```ts group=harness-first
const long = session.send('Plan a three-day trip to Lisbon.')
await session.send('Keep it under 500 euros.', { mode: 'steer' })
await long
```

If the turn makes no further model call, the steer message runs as the next turn.

## 5. Run an agent from code

Every agent in `agents` and `subagents` is on `session.agents`. The input and the result are typed from the definition.

```ts group=harness-first
const price = await session.agents.pricer.run({ vendor: 'acme' })
console.log(price.cents)
```

The session adds a short note about the result, or the error, to the transcript. The model sees it on the next turn. To run the agent in the background and start a new turn when it finishes or fails, use `start`:

```ts group=harness-first
session.agents.pricer.start({ vendor: 'globex' }, { startTurnWhenDone: true })
```

## 6. Add a plugin

A plugin adds tools, prompts, middleware, and agents to every session. `setup` runs once when the session opens. Resources you acquire close when the session closes.

```ts group=harness-first
import { toolDefinition } from '@tanstack/ai'
import { definePlugin } from '@tanstack/ai-harness'

const clock = definePlugin({
  name: 'acme/clock',
  setup: () => ({
    prompts: [`Today is ${new Date().toDateString()}.`],
    tools: [
      toolDefinition({
        name: 'current_time',
        description: 'Get the current time',
      }).server(async () => new Date().toISOString()),
    ],
  }),
})

export const withClock = defineHarness({
  name: 'acme/assistant-with-clock',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [clock],
})
```

`plugins` is a function, so every session gets its own plugin instances. Set `lifetime: 'turn'` on a plugin to set it up again for each turn, or `lifetime: 'host'` to share one setup between all the sessions of the host.

If two plugins add a tool with the same name, `host.open` fails and names both plugins. To write your own, see [Write a harness plugin](./plugins).

## Keep sessions across restarts

Each host keeps every thread in a session log: the transcript, the inputs, the runs, the approvals that wait, the settings, and the plugin state. The host needs one store for it, `log`:

- `log`: the session log. Required.
- `sessions`: one index entry per thread, for a list of sessions. See [List, rename, and fork sessions](./sessions).
- `metadata`: data wider than one thread, for example the saved rules of `permissions()`.

`memoryPersistence()` has every store, but it keeps them in memory only. To keep the log in your database, implement the [`LogStore` contract](../persistence/store-reference#logstore). Then a turn continues after a crash or a deploy. See [Durable sessions](./durable-sessions).

Before you run many servers or long threads, read the [known limits](./deploy#known-limits).

## Prompt caching

Every session caches the stable start of its requests by default, with its `threadId` as the cache key. To change the default for every session, set `promptCache` on the harness:

```ts group=harness-first
export const longCache = defineHarness({
  name: 'acme/long-cache',
  adapter: openaiText('gpt-6.1-sol'),
  promptCache: 'long',
})
```

To change it for one session, pass `promptCache` to `host.open`. The session value wins over the harness value:

```ts group=harness-first
const support = await host.open(assistant, {
  threadId: 'thread-2',
  promptCache: { key: 'acme-support' },
})
```

If the `threadId` already has a live session, `host.open` gives a handle to that session, which keeps its first `promptCache` value. The agents that the model calls as tools use the retention of the turn. `session.usage()` shows the cache reads and writes, see [Track usage and cost](./usage). For the options and the cost, see [Prompt Caching](../advanced/prompt-caching).

To change it for one prompt, pass `overrides.promptCache`. See [Give one prompt its own settings](./turn-control#give-one-prompt-its-own-settings).

## Set a reasoning level

A harness sends no reasoning level by default, so the main model thinks at the default of its provider. To set a level for every turn, set `reasoning` on the harness:

```ts group=harness-first
export const careful = defineHarness({
  name: 'acme/careful',
  adapter: openaiText('gpt-6.1-sol'),
  reasoning: 'medium',
})
```

`reasoning` is a level, or an object with these fields:

- `level`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. A model that does not have the level gets the nearest level that it has.
- `summary`: `true` streams the thinking text. `false` keeps it out of the stream.
- `budgetTokens`: optional. A thinking token budget, for models that think with a budget.

For the levels of each model, see [Reasoning](../chat/reasoning). To use another level for one prompt, pass `overrides.reasoning`. See [Give one prompt its own settings](./turn-control#give-one-prompt-its-own-settings).

## What you have now

- A harness defined once, with the same options as `chat()`.
- A session that keeps the conversation and streams AG-UI events.
- Queue, steer, and follow-up for messages that arrive during a turn.
- Typed agents you run from code, in the foreground or the background.
- Plugins that add tools and prompts to each session.

Next: open [Run agents from a harness](./subagents) to start agents from plugins and let the model call them as tools.
