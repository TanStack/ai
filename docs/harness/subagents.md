---
title: Run agents from a harness
id: harness-subagents
order: 8
description: "Start typed agents from commands and plugins, run them in groups, call a whole harness as a child, and keep the tree within limits."
keywords:
  - tanstack ai
  - harness
  - subagents
  - agents
  - limits
---

A review command needs an explorer to collect facts, then a reviewer to judge them. A research task needs three explorers at once. In a harness, plugins and commands start agents from code, and a whole harness can be a child of another one.

## Run agents from a plugin

`ctx.agents` runs any agent of the session, or an agent you pass in. Input and result types come from the agent.

```ts group=harness-subagents
import { defineAgent } from '@tanstack/ai'
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const explorer = defineAgent({
  name: 'explorer',
  description: 'Collects facts about a topic',
  inputSchema: z.object({ task: z.string() }),
  run: (ctx) =>
    ctx.chat({
      adapter: openaiText('gpt-5.6-luna'),
      messages: [{ role: 'user', content: ctx.input.task }],
      stream: false,
    }),
})

export const review = definePlugin({
  name: 'acme/review',
  setup: (ctx) => ({
    agents: [explorer],
    commands: {
      review: defineCommand({
        description: 'Review a topic',
        input: z.object({ topic: z.string() }),
        run: async ({ topic }) => {
          const [auth, sessions] = await ctx.agents.group({ onFailure: 'cancel-siblings' }, (group) =>
            Promise.all([
              group.run(explorer, { task: `${topic}: auth checks` }),
              group.run(explorer, { task: `${topic}: session expiry` }),
            ]),
          )
          return `${auth}\n\n${sessions}`
        },
      }),
    },
  }),
})
```

- `ctx.agents.run(agent, input)` runs one agent and resolves with its result.
- `ctx.agents.start(agent, input, { wake: true })` runs it in the background and starts a turn when it is done.
- `ctx.agents.group(options, body)` runs several. With `onFailure: 'cancel-siblings'`, one failure cancels the others. With `'collect'`, use `group.runSettled` to get every result or error. Every child settles before `group` returns.

## Call a harness as a child

`harnessAgent` turns a harness into an agent. Put it in `subagents.agents`, and the main model calls it as a tool. The child harness keeps its own tools, plugins, and history.

```ts group=harness-subagents
import { defineHarness, harnessAgent } from '@tanstack/ai-harness'

const reviewer = defineHarness({
  name: 'acme/reviewer',
  description: 'Reviews a change and lists the risks',
  adapter: openaiText('gpt-5.6'),
})

export const lead = defineHarness({
  name: 'acme/lead',
  adapter: openaiText('gpt-5.6'),
  subagents: { agents: [harnessAgent(reviewer)] },
})
```

The tool name comes from the harness name, with characters other than letters, digits, `_`, and `-` changed to `_`. Pass `name` to pick another.

## Stay within limits

A harness always limits its children. Without `subagents.limits`, it uses a depth of 2, 3 children at once, and 12 children per tree. Agents started from code count against the same limits:

```ts group=harness-subagents
export const careful = defineHarness({
  name: 'acme/careful',
  adapter: openaiText('gpt-5.6'),
  subagents: {
    agents: [explorer],
    limits: { maxDepth: 1, maxConcurrent: 2, maxCalls: 6, timeoutMs: 60_000 },
  },
})
```

See [subagent limits](../chat/subagents) for what each limit does.

## What you have now

- Commands and plugins that start typed agents, alone or in groups.
- Harnesses that call other harnesses as tools.
- A tree of children that stays within limits.
