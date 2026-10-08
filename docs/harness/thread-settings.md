---
title: Store settings per thread
id: harness-thread-settings
order: 4
description: "Store the model, reasoning, instructions, tools, plugins, and working folder of each thread, so the choice stays after a reload and a restart."
keywords:
  - tanstack ai
  - harness
  - settings
  - configure
  - model picker
  - cwd
---

Each conversation in your app has its own choices: a faster model for one chat, extra instructions for another, a folder for a coding task. These choices must stay after a reload and a restart. `session.configure()` stores them with the thread, and every next turn uses them.

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
    fast: anthropicText('claude-haiku-4-5'),
    strong: anthropicText('claude-opus-5-5'),
  },
  // The fields a client may change. See "Let the user pick".
  expose: { settings: ['model', 'reasoning'] },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
```

## 2. Store the settings of a thread

```ts group=harness-thread-settings
const session = await host.open(assistant, { threadId: 'review-thread' })

const receipt = await session.configure({
  model: 'strong',
  reasoning: 'high',
  instructions: 'Answer in French.',
})
console.log(receipt.status) // 'accepted'
console.log(session.settings()) // { model: 'strong', reasoning: 'high', instructions: 'Answer in French.' }
```

The settings apply from the next turn. A field that you leave out stays as it is. Set a field to `null` to clear it:

```ts group=harness-thread-settings
await session.configure({ instructions: null })
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

An unknown field, model, or plugin, or a bad value, gets a receipt with `status: 'rejected'` and the reason. `stores.metadata` keeps the settings, so they stay after a restart. Without a metadata store, they stay in memory. A [fork](./fork-and-reset) copies them.

## 3. Let the user pick

A client can change only the fields in `expose.settings` of the harness. The harness above exposes `model` and `reasoning`. [Choose what clients can change](./connect#choose-what-clients-can-change) lists the other `expose` fields.

- A client input with another field gets `status: 'rejected'` with the reason `not_exposed`. Nothing changes.
- With no `expose.settings`, a client can change no field.
- Server code that calls `session.configure()` can change every field.
- Expose `plugins` and `instructions` only to clients that you trust. With them, a client can turn off a plugin (for example the one that asks for approvals) and write into the system prompt.

`describe()` returns the stored `settings` and the names of the `models`, so a UI can build a menu. A client stores a choice with `client.configure()`:

```ts group=harness-thread-settings-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'review-thread',
})

const { models, settings } = await client.describe()
console.log(models) // ['fast', 'strong']
console.log(settings?.model)

await client.configure({ model: 'fast' })
```

Over `POST control`, the same input is `{ op: 'configure', settings }`. It is an input, so the log keeps who changed what. Each change sends a `harness.settings.changed` event with the new `settings`.

## What wins

A turn can get its model from four places. The first one that is set wins:

1. The `overrides.adapter` of the prompt. See [Give one prompt its own settings](./turn-control#give-one-prompt-its-own-settings).
2. The stored `model`.
3. A plugin `adapter()` pick. See [Pick the model of a turn](./plugins#pick-the-model-of-a-turn).
4. The `adapter` of the harness.

For `reasoning`, the `overrides` of the prompt win, then the stored setting, then the `reasoning` of the harness.

## Tools and plugins

- A `tools` list keeps only the tools with those names. `{ remove }` drops the tools with those names. Either way, the tools of the prompt `overrides` stay.
- The harness applies `tools` before the plugins prepare the tool list. So [code mode](./code-mode) wraps only the tools that a thread keeps.
- `plugins: { remove }` leaves the tools, prompts, middleware, and model pick of those plugins out of the turn. Plugins that run once per session stay mounted.
- The agents and subagents that a removed plugin gives stay available.

## The working folder

`workspaceTools` work in the `cwd` of the thread. Relative paths start there, and `bash` runs there:

```ts group=harness-thread-settings
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: anthropicText('claude-sonnet-5-5'),
  plugins: () => [workspaceTools({ root: '/srv/repos' })],
})

const task = await host.open(coder, { threadId: 'fix-login' })
await task.configure({ cwd: 'web-app' })
```

`cwd` is relative to `root`. The tools refuse a working folder outside `root`. The coding agents of `@tanstack/ai-sandbox` get their folder from the sandbox, so they do not read `cwd`.

When `cwd` changes, the model gets a short note before its next call. So it stops using the paths of the old folder:

- A new `cwd` adds "The working folder is now web-app. Paths are relative to it."
- `cwd: null` adds "The working folder is the default folder again."
- The same `cwd` again adds no note.
- A thread with no messages yet gets no note. The workspace tools prompt tells the model the folder.

The note is an assistant message in the transcript, so it stays after a restart. A change while a turn runs adds the note before the next turn. On a durable host (one with `stores.log`), the log keeps that waiting note, and the next host adds it once after a crash. Without `stores.log`, a crash loses a note that waits.

## What you have now

- A model menu per thread, from the `models` of the harness.
- Instructions, reasoning, tools, and plugins that each thread keeps.
- A working folder per thread for the workspace tools.
- Settings that stay after a reload and a restart.
