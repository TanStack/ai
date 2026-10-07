---
title: Write a harness plugin
id: harness-plugins
order: 5
description: "Package tools, prompts, middleware, settings, commands, and state as a plugin that any harness can load."
keywords:
  - tanstack ai
  - harness
  - plugins
  - definePlugin
  - extension points
---

You built a feature for one harness, a todo list or a GitHub integration, and now you want it in every harness you ship. A plugin packages it: tools and prompts for the model, commands for the user, settings, and state that survives restarts.

## The smallest plugin

```ts group=harness-plugins
import { definePlugin } from '@tanstack/ai-harness'

export const today = definePlugin({
  name: 'acme/today',
  setup: () => ({ prompts: [`Today is ${new Date().toDateString()}.`] }),
})
```

Add it with `plugins: () => [today]` in `defineHarness`. `setup` runs once per session.

## What `setup` can return

- `tools`: tools for the model, made with `toolDefinition`.
- `prompts`: text for the system prompt. A function runs for each turn, so it can show current state.
- `middleware`: chat middleware for the lead turn, the same type as `chat({ middleware })`. `agentMiddleware` is for agent runs, see [Middleware in every agent](#middleware-in-every-agent).
- `generationMiddleware`: middleware for the activities agents call.
- `agents`: agents added to `session.agents`. `routing.router` can send a turn to them too, see [Route a turn to an agent](./subagents#route-a-turn-to-an-agent).
- `subagents`: agents the model can call as tools. They are also added to `session.agents`. [Delegate to coding agents](./coding-agents) uses them.
- `adapter`: a picker for the model of each turn, see [Pick the model of a turn](#pick-the-model-of-a-turn).
- `commands`: user actions, see below.
- `config`: session settings, see below.
- `contribute`: items for another plugin's extension point.

If two plugins add the same tool, command, setting, or prompt id, `host.open` fails and names both plugins.

## Add commands and settings

Commands are actions for the user, not the model: slash commands, buttons, dashboard actions. Settings are typed, saved per session, and apply at the next turn.

```ts group=harness-plugins
import { configOption, defineCommand } from '@tanstack/ai-harness'
import { z } from 'zod'

export const greeter = definePlugin({
  name: 'acme/greeter',
  setup: (ctx) => ({
    config: {
      tone: configOption.select({ options: ['plain', 'warm'], default: 'plain' }),
    },
    commands: {
      greet: defineCommand({
        description: 'Greet someone',
        input: z.object({ name: z.string() }),
        run: async ({ name }, command) => {
          const sure = await command.session.ask({
            message: `Greet ${name}?`,
            schema: z.boolean(),
          })
          if (!sure) return 'Skipped.'
          return ctx.config.get('tone') === 'warm' ? `Hello, dear ${name}!` : `Hello, ${name}.`
        },
      }),
    },
  }),
})
```

- `session.command('greet', { name: 'Ada' })` runs the command. The input is checked against its schema.
- `session.setConfig('tone', 'warm')` changes the setting. A value the option does not accept is rejected.
- `ask` waits for `session.answer(questionId, value)`. The question shows up in `session.snapshot().pendingQuestions`, and the CLI prompts for it.

## Change commands while the session runs

Some commands come from data that changes: a folder of skills, saved shortcuts, a list from a server. `ctx.commands` adds and removes them while the session runs. Here `/macro` saves a new command that sends a message:

```ts group=harness-plugins
export const macros = definePlugin({
  name: 'acme/macros',
  setup: (ctx) => ({
    commands: {
      macro: defineCommand({
        description: 'Save a command that sends a message: /macro <name> <message>',
        run: (input: unknown) => {
          const [name = '', ...words] = String(input ?? '').trim().split(' ')
          if (ctx.commands.has(name)) return `/${name} is taken.`
          ctx.commands.set(
            name,
            defineCommand({
              description: `Send: ${words.join(' ')}`,
              run: () => {
                void ctx.session.prompt(words.join(' '))
              },
            }),
          )
          return `Saved /${name}.`
        },
      }),
    },
  }),
})
```

- `ctx.commands.set(name, command)` adds a command of this plugin, or replaces it. A name that another plugin owns throws.
- `ctx.commands.delete(name)` removes a command of this plugin. Another plugin's name does nothing.
- Session views (`createSessionView`) get the new list at once, so the command shows in the `/` list of a CLI.
- During `setup`, wait for `ctx.commands.ready` before you call `has` or `set`. The plugins after this one add their commands later, so a name can look free and still be taken.

```ts group=harness-plugins
export const greetings = definePlugin({
  name: 'acme/greetings',
  setup: (ctx) => {
    void ctx.commands.ready.then(() => {
      if (!ctx.commands.has('hi')) {
        ctx.commands.set('hi', defineCommand({ description: 'Say hi', run: () => 'Hi!' }))
      }
    })
  },
})
```

The [skills plugin](./skills) works this way: one command for each skill in a folder.

## Change agents while the session runs

Agents can come from data that changes too. `ctx.agents.set` and `ctx.agents.delete` work like `ctx.commands`. Here `/helper` adds an agent that the session can run at once:

```ts group=harness-plugins
import { defineAgent } from '@tanstack/ai'

export const helpers = definePlugin({
  name: 'acme/helpers',
  setup: (ctx) => ({
    commands: {
      helper: defineCommand({
        description: 'Add an agent: /helper <name>',
        run: (input: unknown) => {
          const name = String(input ?? '').trim()
          ctx.agents.set(
            defineAgent({ name, description: `The ${name} agent`, run: async () => 'Done.' }),
          )
          return `Added the ${name} agent.`
        },
      }),
    },
  }),
})
```

- `ctx.agents.set(agent)` adds an agent of this plugin, or replaces the one with the same name. A name that another plugin or the harness owns throws.
- `ctx.agents.delete(name)` removes an agent of this plugin. Another owner's name does nothing.
- `session.agent(name)`, `ctx.agents.list()`, and `routing` see the change at once.

## Keep state

`ctx.state(initial)` gives a plugin its own state, saved in the metadata store. Clients see each change as an AG-UI `STATE_SNAPSHOT` event.

```ts group=harness-plugins
export const counter = definePlugin({
  name: 'acme/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      commands: {
        bump: defineCommand({
          description: 'Add one',
          run: async () => (await state.update((current) => ({ count: current.count + 1 }))).count,
        }),
      },
    }
  },
})
```

When two writers race, `update` runs your function again with fresh state.

## Middleware in every agent

You want to track token cost, or apply a policy, for every model call. But `middleware` runs only in the lead turn. The agents that the lead model calls, the agents you start in the background, and their own children each run a separate chat. Put the same middleware in `agentMiddleware` too. Then it runs in each of those chats.

```ts group=harness-plugins
import type { ChatMiddleware } from '@tanstack/ai'

export const usageByAgent = definePlugin({
  name: 'acme/usage-by-agent',
  setup: () => {
    const tokens = new Map<string, number>()
    const tracker: ChatMiddleware = {
      name: 'acme/usage-by-agent',
      onUsage: (ctx, usage) => {
        const agent = ctx.subagentName ?? 'lead'
        tokens.set(agent, (tokens.get(agent) ?? 0) + usage.totalTokens)
      },
    }
    return {
      middleware: [tracker],
      agentMiddleware: [tracker],
      commands: {
        tokens: defineCommand({
          description: 'Show the tokens of each agent',
          run: () => Object.fromEntries(tokens),
        }),
      },
    }
  },
})
```

- `ctx.subagentName` is the name of the agent. In the lead turn, it is `undefined`.
- `ctx.subagentRunId` is different for each run of an agent. For a nested child, `ctx.parentSubagentRunId` is the id of the child that started it.
- Each model call goes to `onUsage` one time, in the run that made the call. The lead turn does not count the usage of a child again.

## Pick the model of a turn

Some turns need another model: a short question does not need your strongest model, and an organization can allow only some models. Return an `adapter` picker from `setup`. When each turn starts, the session calls it with the message, context, and sender of that turn:

```ts group=harness-plugins
import { anthropicText } from '@tanstack/ai-anthropic'

export const cheapForShortTurns = definePlugin({
  name: 'acme/cheap-for-short-turns',
  setup: () => ({
    adapter: (turn) =>
      typeof turn.message === 'string' && turn.message.length < 200
        ? anthropicText('claude-haiku-4-5')
        : anthropicText('claude-sonnet-5-5'),
  }),
})
```

A short message now runs on Claude Haiku, and a long one on Claude Sonnet.

The `turn` has these fields:

| Field | What it is |
| --- | --- |
| `operationId` | The id of the operation that runs the turn. |
| `inputId` | The id of the input, when the turn has one. |
| `message` | The user message of the input. `undefined` for a resolve. |
| `context` | The [context of the input](./inputs#send-context-with-a-message). It is client data, so do not trust it. |
| `principal` | Who sent the input. See [Share a thread](./shared-threads). |
| `overrides` | The [overrides of the prompt](./turn-control#give-one-prompt-its-own-settings), when it has some. |

The session uses the picks like this:

- `undefined` keeps the harness adapter.
- If more than one plugin returns an adapter, the last plugin wins.
- The `overrides.adapter` of the turn wins over every pick.
- A model that the thread stored with `session.configure` also wins over every pick. See [Store settings per thread](./thread-settings).
- A keyed adapter gets the key of the sender. See [Connect model providers](./provider-keys).

If the picker does not need the turn, it can take no parameter.

### Read the model from your data

The picker is synchronous. To read a database first, give the plugin `lifetime: 'turn'`. The session then runs its `setup` for each turn and gives it the same turn as `ctx.turn`. An async `setup` can read the model from your data:

```ts group=harness-plugins
// Your lookup, for example a database query.
async function planOf(tenantId: string | undefined) {
  return tenantId === 'acme' ? 'strong' : 'fast'
}

export const modelOfTheOrg = definePlugin({
  name: 'acme/model-of-the-org',
  lifetime: 'turn',
  setup: async (ctx) => {
    const plan = await planOf(ctx.turn?.principal?.tenantId)
    const adapter =
      plan === 'strong'
        ? anthropicText('claude-sonnet-5-5')
        : anthropicText('claude-haiku-4-5')
    return { adapter: () => adapter }
  },
})
```

A plugin with the default lifetime has no turn at setup, so its `ctx.turn` is `undefined`.

### Leave out the harness model

When a plugin picks the model of every turn, `defineHarness` needs no `adapter`:

```ts group=harness-plugins
import { defineHarness } from '@tanstack/ai-harness'

export const assistant = defineHarness({
  name: 'acme/assistant',
  plugins: () => [modelOfTheOrg],
})
```

If no plugin picks a model and the turn has no `overrides.adapter`, the turn fails with this error:

```text
This turn has no model. Set `adapter` in defineHarness, return one from a plugin `adapter()`, or pass `overrides.adapter` to the turn.
```

## Let plugins work together

Three ways, from simple to loose:

- **Capabilities.** One plugin declares `provides: [cap]` and calls `ctx.provide(cap, value)`. Another declares `requires: [cap]` and reads `ctx.get(cap)`. The provider must come first.
- **Extension points.** One plugin reads a list, and others add to it in any order.
- **Events.** `ctx.emit(event, value)` reaches every `ctx.on(event, handler)`.

```ts group=harness-plugins
import { createExtensionPoint, createPluginEvent } from '@tanstack/ai-harness'

export const Checks = createExtensionPoint<{ name: string }>('acme/checks')
export const checked = createPluginEvent<{ name: string }>('acme/checked')

export const runner = definePlugin({
  name: 'acme/check-runner',
  setup: (ctx) => {
    const checks = ctx.collect(Checks)
    return {
      commands: {
        check: defineCommand({
          description: 'Run every check',
          run: () => {
            for (const check of checks) ctx.emit(checked, check)
            return checks.map((check) => check.name)
          },
        }),
      },
    }
  },
})

export const lint = definePlugin({
  name: 'acme/lint',
  setup: () => ({ contribute: [Checks.item({ name: 'lint' })] }),
})
```

Read `ctx.collect` at run time (in a command, a tool, or a middleware hook). During `setup`, later plugins have not added their items yet.

## Clean up resources

Open resources with `ctx.resources.acquire(open, close)`. They close when the session closes, newest first. If a later plugin fails in `setup`, every plugin set up so far is cleaned up, and no model request is sent.

Set `lifetime: 'turn'` to set a plugin up again for each turn.

## Reload plugins

You changed a plugin, an agent file, or the list that `plugins()` returns, and an open session still runs the old setup. `session.reload()` sets the plugins up again:

```ts group=harness-plugins
import { watch } from 'node:fs'
import { createHarnessHost } from '@tanstack/ai-harness'

const host = createHarnessHost()
const session = await host.open(assistant, { threadId: 'thread-1' })

// One session.
await session.reload()

// Every open session of the harness, each time an agent file changes.
watch('.agents/agents', () => void host.reload(assistant))
```

A reload works like this:

1. It waits for the running turn to end. No new turn starts until the reload ends.
2. It cleans up the resources of the session plugins, newest first.
3. It calls `plugins()` again and runs `setup` of each session plugin.
4. Clients get a `harness.reloaded` event. Read the commands, the settings, and the agents again.

The transcript, the log, the thread settings, and the inbox stay. The next turn gets the new tools, prompts, and middleware.

The harness does not watch files. Your host decides when to reload, as the `watch` call above does. The [`agents()` plugin](./agents) reads its `dirs` again at each reload, so a new agent file shows up.

If a `setup` throws, the session keeps working with no plugins. The promise rejects with the error, and the `harness.reloaded` event has its `error` message. Fix the plugin and call `reload()` again.

## See the plan

`session.inspect()` lists the plugins in order, and who owns each tool, prompt, command, setting, and extension point item.

## What you have now

- A plugin that adds tools, prompts, commands, settings, and state to any harness.
- Middleware that sees every model call, in the lead turn and in every agent.
- A picker that chooses the model of each turn from its message, context, and sender.
- Plugins that share services, lists, and events without knowing each other.
- Commands, agents, and whole plugins that change while the session runs.

Next: see the [first-party plugins](./coding-agent) that turn a harness into a coding agent.
