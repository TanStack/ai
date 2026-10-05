---
title: Run agents from a harness
id: harness-subagents
order: 14
description: "Start typed agents from commands and plugins, run them in groups, route a turn to an agent, call a whole harness as a child, and keep the tree within limits."
keywords:
  - tanstack ai
  - harness
  - subagents
  - agents
  - routing
  - limits
---

A review command needs an explorer to collect facts, then a reviewer to judge them. A research task needs three explorers at once. In a harness, plugins and commands start agents from code, and a whole harness can be a child of another one. A router can also send a whole turn to an agent.

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
- `ctx.agents.start(agent, input, { wake: true })` runs it in the background and starts a turn when it finishes or fails.
- `ctx.agents.group(options, body)` runs several. With `onFailure: 'cancel-siblings'`, one failure cancels the others. With `'collect'`, use `group.runSettled` to get every result or error. Every child settles before `group` returns.

To track usage or apply a policy in each of these runs, see [Middleware in every agent](./plugins#middleware-in-every-agent).

The harness saves the images, audio, and video that these agents make, and the UI shows them. See [Media that agents make](./media#media-that-agents-make).

## Keep a background agent going after a crash

A background agent can work for a long time. When its host stops, for example in a deploy, the next host fails the run. Start it with `resume: true`, and the next host runs it again instead:

```ts group=harness-subagents
// Your own services.
async function startExport(customer: string) {
  return `export-${customer}`
}
async function importInto(region: string, exportId: string) {
  return `${exportId} is in ${region}`
}

const migrator = defineAgent({
  name: 'migrator',
  description: 'Moves the data of one customer to the new region',
  inputSchema: z.object({ customer: z.string() }),
  run: async (ctx) => {
    // Each side effect is a step. A finished step does not run again.
    const exportId = await ctx.step.do('export', () => startExport(ctx.input.customer))
    await ctx.step.do('import', () => importInto('eu-west', exportId))
    return ctx.chat({
      adapter: openaiText('gpt-5.6'),
      messages: [{ role: 'user', content: `Write a short report about ${exportId}.` }],
      stream: false,
    })
  },
})

export const migrations = definePlugin({
  name: 'acme/migrations',
  setup: (ctx) => ({
    agents: [migrator],
    commands: {
      migrate: defineCommand({
        description: 'Move one customer',
        input: z.object({ customer: z.string() }),
        run: ({ customer }) => {
          ctx.agents.start(migrator, { customer }, { resume: true, wake: true })
          return `Moving ${customer}.`
        },
      }),
    },
  }),
})
```

1. Give the host a session log (`stores.log`). See [Durable sessions](./durable-sessions). Without a log, `start` with `resume: true` throws.
2. Put each side effect in `ctx.step.do(name, fn)`. The agent code runs again from its start, and a finished step returns its stored value.
3. Give each step a name that is the same on every run, and return a JSON value from `fn`.

What the next host does:

- It runs the agent again with the same input. Its `ctx.chat` calls continue from the saved transcript, and its finished tool calls do not run again.
- A step runs at least once. A host can stop after `fn` ran and before the log stored its value. Then the next run calls `fn` again.
- After `durability.maxAttempts` runs (default 10), the run ends `failed` with the code `attempts_exhausted`.
- `host.close()` cancels the run. Only a host that stops without a close (a crash or a kill) leaves the run for the next host.

## Route a turn to an agent

Your harness has a writer and a pricer, but the main model answers every turn. Add `routing.router` to send a turn to the agent that can answer it. The router runs at the start of each new turn: a `prompt`, a `followUp`, or the wake turn of a background agent.

```ts
import { chat, decide, defineAgent, subagentRoute } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { typesafeDecider } from '@tanstack/ai-typesafe'
import { z } from 'zod'

const writer = defineAgent({
  name: 'writer',
  description: 'Writes blog posts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-5.6'), stream: false }),
})

const pricer = defineAgent({
  name: 'pricer',
  description: 'Compares the plans and prices of one vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: (ctx) =>
    ctx.chat({
      adapter: openaiText('gpt-5.6'),
      messages: [{ role: 'user', content: `Compare the plans of ${ctx.input.vendor}` }],
      stream: false,
    }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-5.6'),
  agents: [writer, pricer],
  routing: {
    router: async ({ agents, messages, adapter }) => {
      const route = subagentRoute(agents)
      const result = await decide({
        adapter: typesafeDecider('jev-latest'),
        state: messages,
        questions: route.questions,
      })
      const inputs = Object.fromEntries(
        await Promise.all(
          route.needsInput(result).map(async ({ name, inputSchema }) => [
            name,
            await chat({ adapter, messages, outputSchema: inputSchema }),
          ]),
        ),
      )
      return route.pick(result, { inputs })
    },
  },
})
```

- `agents` holds the root agents of the turn: the harness `agents` and the `agents` that plugins add. An agent that is only in `subagents` is not in this list.
- `subagentRoute(agents)` makes one yes/no question for each agent, from its `description`. `decide()` answers them.
- `route.needsInput(result)` lists the picked agents that have an `inputSchema`, each with its schema. Here the main model writes each input. `adapter` is the main adapter of the turn, with the user's keys.
- `route.pick(result, { inputs })` gives each agent its input. If a picked agent with a schema has no input, `pick` throws.

The router can also return a pick of its own: `'main'`, a name, a list of names, `{ names, order }`, or `{ steps }`. Anywhere a name goes, `{ name, input }` can go too, for example `{ name: 'pricer', input: { vendor: 'Acme' } }`. If a picked agent has an `inputSchema` and no input, the turn fails with `Agent "pricer" needs input. Return { name: 'pricer', input } from the router.` See [Route, or let the model pick](../chat/subagents#route-or-let-the-model-pick) for each pick.

The router also gets `session`, the `input` of the turn as the user sent it, `operationId`, `inputId`, and `abortSignal`. Next to `router`, `routing` takes `order`, `strategy`, `limits`, and `sandbox`. They work the same as in `subagents`.

What the turn does with the pick:

- `'main'`: the main model answers, with its `subagents` as usual.
- Agent names: only those agents run. The harness does not call the main model. The turn text is their answer as the transcript keeps it, for example `pricer:\n...`.
- `strategy: 'handoff'`: the agents run first. Then the main model answers in the same turn. It reads their text and keeps its subagent tools.
- An interrupt in a routed agent ends the turn. `session.resolve` continues the same plan, and it does not call the router again.
- A steer that you send during a routed turn waits. It runs as its own turn, and the router picks for that turn too.

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
- Background agents that continue on the next host after a crash, with steps that do not run twice.
- A router that sends each turn to the right agent, and gives each agent its input.
- Harnesses that call other harnesses as tools.
- A tree of children that stays within limits.
