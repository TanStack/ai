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
- `middleware`: chat middleware, the same type as `chat({ middleware })`.
- `generationMiddleware`: middleware for the activities agents call.
- `agents`: agents added to `session.agents`.
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

Set `lifetime: 'run'` to set a plugin up again for each turn.

## See the plan

`session.inspect()` lists the plugins in order, and who owns each tool, prompt, command, setting, and extension point item.

## What you have now

- A plugin that adds tools, prompts, commands, settings, and state to any harness.
- Plugins that share services, lists, and events without knowing each other.

Next: see the [first-party plugins](./coding-agent) that turn a harness into a coding agent.
