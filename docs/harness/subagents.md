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
      adapter: openaiText('gpt-6-luna'),
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
      adapter: openaiText('gpt-6.1-sol'),
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

## Message a running agent

A background agent drafts a post for ten minutes. Halfway through, the user sees that it cites blogs, not papers. Or the draft is done and they want one more change. Send the run a message, and the agent uses it.

`start()` returns an `AgentRun`. Call `send` on it:

```ts group=harness-subagents-messages
import { defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const drafter = defineAgent({
  name: 'drafter',
  description: 'Drafts a blog post',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol'), stream: false }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  agents: [drafter],
  expose: { agents: ['drafter'] },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(studio, { threadId: 'user-1-thread' })

const run = session.agents.drafter.start()

// Joins the next model call of this run.
await run.send('Cite papers, not blogs.')

// Runs the agent again after this run ends.
const receipt = await run.send('Add a title.', { mode: 'followUp' })
console.log(receipt.status, receipt.operationId)
```

The `mode` decides when the agent reads the message:

- `'steer'` (the default): the message joins the next model call of the run. If the run makes no more model calls, the message runs as a follow-up.
- `'followUp'`: the agent runs again after the run ends. The new run reads the transcript of the run, plus the message, with the same first input and options. If the run already ended, the new run starts at once.

For a follow-up, `receipt.operationId` is the id of the new run. While the run before it still runs, `receipt.status` is `queued`.

A steer joins only a run of the same sender. A steer from another sender runs as a follow-up for that sender. As a result, no message runs with the credentials of another person.

An agent written as plain code, with no `ctx.chat` call, makes no model call. It gets a steer only as a follow-up.

### Find a run by its id

Your server often has only the id of a run, for example from a button in the UI. Use the session:

```ts group=harness-subagents-messages
for (const info of session.agentRuns()) {
  console.log(info.operationId, info.agent, info.status)
}

if (session.agentRun(run.id)) {
  await session.sendToAgent(run.id, 'Make it shorter.', { mode: 'followUp' })
}
```

- `session.sendToAgent(operationId, message, options)`: does the same as `run.send`. An unknown id gets a receipt with `status: 'rejected'` and `reason: 'not_running'`.
- `session.agentRun(id)`: the run, or `undefined`.
- `session.agentRuns()`: every agent run of the session, oldest first.

Each item of `agentRuns()` has these fields:

- `operationId` and `agent`: the run and the name of its agent.
- `status`: `running`, `queued` (a follow-up that waits for the run before it), `completed`, `failed`, or `cancelled`.
- `parentRunId`: the run whose agent code started this run, if there is one.
- `principal`: the user that the run runs for.

On a durable host (a host with `stores.log`), these three methods also read the log. After a restart, they still find each run, and a follow-up continues a run that ended before the restart. See [Durable sessions](./durable-sessions).

A run and all of its follow-ups keep their messages in one thread: `<threadId>:<name>:<input id of the first run>`. So each follow-up reads the full history of the runs before it.

### Start agents from agent code

An agent can start other agents in the background with `ctx.agents.start(agent, input, options)`. It returns a run that you can await, message, and cancel:

```ts group=harness-subagents-messages
const editor = defineAgent({
  name: 'editor',
  description: 'Starts two drafts and joins them',
  run: async (ctx) => {
    const intro = ctx.agents.start(drafter)
    const outro = ctx.agents.start(drafter)
    await intro.send('Keep it under 100 words.')
    return [await intro, await outro].join('\n\n')
  },
})
```

- Each child counts against the tree budget of the harness: `maxDepth`, `maxConcurrent`, and `maxCalls` in `subagents.limits`. Over the budget, `start` throws and no child starts. See [Stay within limits](#stay-within-limits).
- Each child runs for the sender of its parent run. Its `agentRuns()` item has the `parentRunId` of that run.
- A cancel of a run stops its children first, then the run.
- A cancel of a follow-up that did not start yet removes it. It never runs.

### Messages after a host stop

This applies only to a durable host. When the host stops during a run, the messages that wait for the run are in the log:

- If the run started with `resume: true`, the next host runs it again. The resumed run gets the messages that waited for it.
- If the run started without `resume`, the waiting messages settle `aborted`. A steer that already joined the run settles `failed`, with the run.

### Known limits

- A run that another host runs is in `agentRuns()`, but it takes no message. `sendToAgent` gets `not_running`.
- A follow-up waits for its run. If that run had already ended when the host stopped, the follow-up settles `aborted`.

### Send from the browser

The client sends the same message over HTTP. The harness must list the agent in `expose.agents`. The id of the run comes from the receipt of `client.agents.<name>.start()`, or from the `agents` of a [session view](./custom-ui#3-act-on-the-session):

```ts group=harness-subagents-messages-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { studio } from './harness'

const client = createHarnessClient<typeof studio>({
  url: '/api/harness',
  threadId: 'user-1-thread',
})

export function addTitle(operationId: string) {
  return client.sendToAgent(operationId, 'Add a title.', { mode: 'followUp' })
}
```

For the server side and the rejections, see [Send a message to a running agent](./connect#send-a-message-to-a-running-agent).

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
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol'), stream: false }),
})

const pricer = defineAgent({
  name: 'pricer',
  description: 'Compares the plans and prices of one vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: (ctx) =>
    ctx.chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: `Compare the plans of ${ctx.input.vendor}` }],
      stream: false,
    }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
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
  adapter: openaiText('gpt-6.1-sol'),
})

export const lead = defineHarness({
  name: 'acme/lead',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [harnessAgent(reviewer)] },
})
```

The tool name comes from the harness name, with characters other than letters, digits, `_`, and `-` changed to `_`. Pass `name` to pick another.

## Give the model one subagent tool

In a long session, the model can need a follow-up from a child that it started earlier. It can also need to start slow work and answer the user while the work runs. Set `subagents.tool` to `'single'`, and the model gets one `subagent` tool for every agent:

```ts
import { defineAgent } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Researches one question and returns sourced findings',
  inputSchema: z.object({ question: z.string() }),
  run: (ctx) =>
    ctx.chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: ctx.input.question }],
      stream: false,
    }),
})

const writer = defineAgent({
  name: 'writer',
  description: 'Writes and edits drafts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol'), stream: false }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [researcher, writer], tool: 'single' },
})
```

The tool input is the same as in `chat()`: `agent`, then `input` or `prompt`, plus `sessionId` and `background`. See [Give the model one subagent tool](../chat/subagents#give-the-model-one-subagent-tool). In a harness:

- `sessionId` needs no more setup, because the host stores each child.
- `background: true` gives the model `{ subagentRunId, result: { status: 'started' } }` at once. The child runs as a background agent of the session.
- When a background child ends, the session starts a new turn. Its message starts with `Background agent researcher finished:` or `Background agent researcher failed:`.

What a [session view](./custom-ui#what-the-state-holds) shows:

- A child that the tool runs is an `agent` part on the assistant message.
- A background child is in `state.agents` while it runs.
- With a session index, each child gets an entry with its `parentThreadId` and `parentToolCallId`. See [Turn on the session index](./sessions#turn-on-the-session-index).

Known limits:

- A background child cannot be continued by its `sessionId`. If the model needs follow-ups, start the child without `background`.
- Only the turns of the session can start a background child. A child that calls the `subagent` tool with `background` gets the tool error `background needs a harness host.`
- A call with `background` and `sessionId` gets the tool error `background cannot continue a sessionId.`

### Agents from plugins

The `tool` setting also applies to the agents that plugins add. For example, the `agents()` plugin adds its subagent profiles, such as `general` and `explore`. With `subagents: { agents: [], tool: 'single' }`, they share one `subagent` tool:

```ts
import { defineHarness } from '@tanstack/ai-harness'
import { agents } from '@tanstack/ai-harness/plugins'
import { openaiText } from '@tanstack/ai-openai'

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [], tool: 'single' },
  plugins: () => [agents({ adapter: () => openaiText('gpt-6.1-sol') })],
})
```

The permission rules of an `agents()` profile apply only while that profile is the primary agent. They do not apply inside a child run. See [Known limits](./agents#known-limits).

## Stay within limits

A harness always limits its children. Without `subagents.limits`, it uses a depth of 2, 3 children at once, and 12 children per tree. Agents started from code count against the same limits:

```ts group=harness-subagents
export const careful = defineHarness({
  name: 'acme/careful',
  adapter: openaiText('gpt-6.1-sol'),
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
- Running agents that take steers and follow-ups, from your server or from the browser.
- A router that sends each turn to the right agent, and gives each agent its input.
- Harnesses that call other harnesses as tools, and one `subagent` tool that continues a child or starts it in the background.
- A tree of children that stays within limits.
