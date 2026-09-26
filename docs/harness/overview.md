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
  adapter: openaiText('gpt-5.6'),
  systemPrompts: ['You are a helpful assistant.'],
  agents: [pricer],
})
```

`agents` are agents you run from code. Put an agent in `subagents` instead when the model must call it as a tool, the same as in `chat()`.

## 2. Open a session

A host runs sessions. Give it the stores from `@tanstack/ai-persistence`, then open a session for a conversation id.

```ts group=harness-first
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })
```

Opening the same `threadId` again returns the live session.

## 3. Send a prompt

`prompt` returns an operation. Await it for the text of the turn.

```ts group=harness-first
const turn = await session.prompt('Write a haiku about the sea.')
console.log(turn.text)
```

The session saves the transcript, so the next prompt continues the same conversation.

To show the answer while it streams, read the events of the operation:

```ts group=harness-first
const next = session.prompt('Now one about the mountains.')
for await (const entry of next.events()) {
  if (entry.event.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(entry.event.delta)
  }
}
```

The events are standard AG-UI events. `session.events({ from: cursor })` gives the events of every operation, from a cursor you saved.

## 4. Send messages while it works

Users type while the agent works. Pick what a new message does:

- `session.prompt(text)`: runs after the current turn. This is the default.
- `session.prompt(text, { busy: 'reject' })`: refuses the message while a turn runs.
- `session.steer(text)`: adds the message to the running turn, before its next model call.
- `session.followUp(text)`: runs after all current work.

```ts group=harness-first
const long = session.prompt('Plan a three-day trip to Lisbon.')
await session.steer('Keep it under 500 euros.')
await long
```

If the turn makes no further model call, the steer message runs as the next turn.

## 5. Run an agent from code

Every agent in `agents` and `subagents` is on `session.agents`. The input and the result are typed from the definition.

```ts group=harness-first
const price = await session.agents.pricer.run({ vendor: 'acme' })
console.log(price.cents)
```

The session adds a short note about the result to the transcript. The model sees it on the next turn. To run the agent in the background and start a new turn when it is done, use `start`:

```ts group=harness-first
session.agents.pricer.start({ vendor: 'globex' }, { wake: true })
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
  adapter: openaiText('gpt-5.6'),
  plugins: () => [clock],
})
```

`plugins` is a function, so every session gets its own plugin instances. Set `lifetime: 'run'` on a plugin to set it up again for each turn.

If two plugins add a tool with the same name, `host.open` fails and names both plugins.

## Keep sessions across restarts

The host takes the same stores as `withPersistence`. Add an `inbox` store and the session also keeps the messages it accepted but did not start yet. When the session opens again, it runs them.

- `messages`: the transcript. Required.
- `runs`: the record of every turn and agent run.
- `interrupts`: approvals that wait for a user.
- `inbox`: accepted messages that did not run yet.

`memoryPersistence()` has every store, but it keeps them in memory only. Write your own stores to keep data in your database. See [Build your own adapter](../persistence/build-your-own-adapter).

## What you have now

- A harness defined once, with the same options as `chat()`.
- A session that keeps the conversation and streams AG-UI events.
- Queue, steer, and follow-up for messages that arrive during a turn.
- Typed agents you run from code, in the foreground or the background.
- Plugins that add tools and prompts to each session.

Next: open the [subagents guide](../chat/subagents) to let the model call your agents as tools.
