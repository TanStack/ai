---
title: Store settings per thread
id: harness-thread-settings
order: 4
description: "Store the model, reasoning, instructions, tools, plugins, and working folder of each thread, so the choice stays after a reload and a restart."
keywords:
  - tanstack ai
  - harness
  - threadSettings
  - updateThreadSettings
  - model picker
  - cwd
---

Each conversation in your app has its own choices: a faster model for one chat, extra instructions for another, a folder for a coding task. These choices must stay after a reload and a restart. `session.updateThreadSettings()` stores them with the thread, and every next turn uses them.

## 1. Name the models a thread can pick

Give the harness a `models` map. A thread picks a model by its name:

```ts group=harness-thread-settings
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { anthropicText } from '@tanstack/ai-anthropic'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: anthropicText('claude-sonnet-5-5'),
  models: {
    fast: anthropicText('claude-haiku-5-5'),
    strong: anthropicText('claude-opus-5-5'),
  },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
```

## 2. Store the settings of a thread

```ts group=harness-thread-settings
const session = await host.open(assistant, { threadId: 'review-thread' })

const receipt = await session.updateThreadSettings({
  settings: {
    model: 'strong',
    reasoning: 'high',
    instructions: 'Answer in French.',
  },
})
console.log(receipt.status) // 'accepted'
console.log(session.threadSettings()) // { model: 'strong', reasoning: 'high', instructions: 'Answer in French.' }
```

The settings apply from the next turn. A field that you leave out stays as it is. `updateThreadSettings` merges your fields into the latest stored settings, also when another host changed them. Set a field to `null` to clear it:

```ts group=harness-thread-settings
await session.updateThreadSettings({ settings: { instructions: null } })
```

The six fields:

| Field | What it does |
| --- | --- |
| `model` | A name from `models`. |
| `reasoning` | The reasoning level of every turn, as `chat({ reasoning })` takes it. |
| `instructions` | Text added as the last system prompt of every turn. |
| `tools` | Exactly these tools by name, or `{ remove: [names] }` for every tool but those. |
| `plugins` | `{ remove: [names] }`: the turns leave out what those plugins give. |
| `cwd` | The working folder of the thread. See [The working folder](#the-working-folder). |

An unknown field, model, or plugin, or a bad value, gets a receipt with `status: 'rejected'` and the reason. The settings are in the log, so a durable log store keeps them after a restart. A [fork](./fork-and-reset) copies them.

`updateThreadSettings` stores an input, so the log keeps who changed what. Each change sends a `harness.settings.changed` event with the new `settings`. A session on another host reads the change too, so its next turn uses the new settings.

A client can change only the fields in `expose.settings` of the harness. See [Choose what clients can change](./connect#choose-what-clients-can-change).

## 3. Build a model menu

`session.describe()` returns the stored `settings` and the names of the `models`, so a UI can build a menu:

```ts group=harness-thread-settings
const { models, settings } = session.describe()
console.log(models) // ['fast', 'strong']
console.log(settings.model) // 'strong'

await session.updateThreadSettings({ settings: { model: 'fast' } })
```

## What wins

A turn can get its model from four places. The first one that is set wins:

1. The `overrides.adapter` of the prompt. See [Give one prompt its own settings](./turn-control#give-one-prompt-its-own-settings).
2. The stored `model`.
3. A plugin `adapter()` pick. See [Pick the model of a turn](./plugins#pick-the-model-of-a-turn).
4. The `adapter` of the harness.

For `reasoning`, the `overrides` of the prompt win, then the stored setting, then the `reasoning` of the harness.

## Tools and plugins

- A `tools` list keeps only the tools with those names. `{ remove }` drops the tools with those names. Either way, the tools of the prompt `overrides` stay.
- The harness applies `tools` before the plugins prepare the tool list (`prepareTools`). So a plugin that wraps tools sees only the tools that a thread keeps.
- `plugins: { remove }` leaves everything that those plugins give out of the thread: tools, prompts, middleware, the model pick, agents, subagents, commands, and the items that they add for other plugins. For example, a thread without `agents()` gets no subagent tools, no `/agent` command, and no permission rules of its agent profiles. The thread also cannot run an agent of a removed plugin by its name.
- Plugins that run once per session stay mounted, but they give the thread nothing.
- If a plugin that stays (of any lifetime) or a harness `middleware` entry needs a capability of a removed plugin, the setting is rejected.

## The working folder

`cwd` is the working folder of the thread, for the plugins whose tools work in a folder. A plugin reads it at each call with `ctx.session.threadSettings().cwd`, so a change applies from the next turn:

```ts group=harness-thread-settings
const task = await host.open(assistant, { threadId: 'fix-login' })
await task.updateThreadSettings({ settings: { cwd: 'web-app' } })
console.log(task.threadSettings().cwd) // 'web-app'
```

When `cwd` changes, the model gets a short note before its next call. So it stops using the paths of the old folder:

- A new `cwd` adds "The working folder is now web-app. Paths are relative to it."
- `cwd: null` adds "The working folder is the default folder again."
- The same `cwd` again adds no note.
- A thread with no messages yet gets no note.

The note is an assistant message in the transcript, so it stays after a restart. A change while a turn runs adds the note before the next turn. The log keeps that waiting note, and the next host adds it once after a crash.

## What you have now

- A model menu per thread, from the `models` of the harness.
- Instructions, reasoning, tools, and plugins that each thread keeps.
- A working folder per thread for the plugins that read it.
- Settings that stay after a reload and a restart.
