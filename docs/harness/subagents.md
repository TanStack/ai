---
title: Run agents from a harness
id: harness-subagents
order: 14
description: "Start typed agents from plugins, message them while they run, route a turn to an agent, and call a whole harness as a child."
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
      adapter: openaiText('gpt-6.1-sol'),
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
- `ctx.agents.start(agent, input, { principal })` runs it as that user. The wake turn runs as the same user.
- Without `principal`, a plugin with `lifetime: 'turn'` starts it as the user of its turn. A session plugin starts it as the user who opened the session. To start it for the user of a tool call, pass `principal: ctx.context.run.principal`.
- `ctx.agents.group(options, body)` runs several. With `onFailure: 'cancel-siblings'`, one failure cancels the others. With `'collect'`, use `group.runSettled` to get every result or error. Every child settles before `group` returns.

The turn that `wake: true` starts sends the model a user message from the harness, for example `Background agent pricer finished: ...`. The user did not write it. So the transcript marks it with `metadata.harness.wake: true`, and a view from `createSessionView` does not show it. In your own chat UI, skip the user messages with this mark.

To track usage or apply a policy in each of these runs, see [Middleware in every agent](./plugins#middleware-in-every-agent).

The harness saves the images, audio, and video that these agents make. See [Media that agents make](./media#media-that-agents-make).

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
    const { step } = ctx.harness
    // Each side effect is a step. A finished step does not run again.
    const exportId = await step.do('export', () => startExport(ctx.input.customer))
    await step.do('import', () => importInto('eu-west', exportId))
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

1. Keep the session log in a store that survives a restart. See [Durable sessions](./durable-sessions).
2. Put each side effect in `ctx.harness.step.do(name, fn)`. The agent code runs again from its start, and a finished step returns its stored value.
3. Give each step a name that is the same on every run, and return a JSON value from `fn`.

`ctx.harness` gives the agent `step` and `agents`. When your app loads `@tanstack/ai-harness`, every agent run has it. A run that a session starts from code gets the full context. In other runs, for example an agent that the model calls as a tool, or an agent in a plain `chat()`:

- `step.do` runs `fn` each time.
- `agents.start` throws an error.

What the next host does:

- It runs the agent again with the same input. Its `ctx.chat` calls continue from the saved transcript, and its finished tool calls do not run again.
- A step runs at least once. A host can stop after `fn` ran and before the log stored its value. Then the next run calls `fn` again.
- After `durability.maxAttempts` runs (default 10), the run ends `failed` with the code `attempts_exhausted`.
- `host.close()` cancels the run. A crash, a kill, or `host.close({ recoverable: true })` leaves the run for the next host.

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

To message a run from the browser, see [Send a message to a running agent](./connect#send-a-message-to-a-running-agent).

### Find a run by its id

Your server often has only the id of a run, for example from a button in the UI. Use the session:

```ts group=harness-subagents-messages
for (const info of session.agentRuns()) {
  console.log(info.operationId, info.agent, info.status)
}

if (session.agentRun(run.id)) {
  await session.send('Make it shorter.', { to: run.id, mode: 'followUp' })
}
```

- `session.send(message, { to: operationId, mode })`: does the same as `run.send`, and returns an operation that ends with the run that gets the message. `await operation.receipt` is the receipt. An unknown id gets a receipt with `status: 'rejected'` and `reason: 'not_running'`, and the operation rejects with `InputRejectedError`.
- `session.agentRun(id)`: the run, or `undefined`.
- `session.agentRuns()`: every agent run of the session, oldest first.

Each item of `agentRuns()` has these fields:

- `operationId` and `agent`: the run and the name of its agent.
- `status`: `running`, `queued` (a follow-up that waits for the run before it), `completed`, `failed`, or `cancelled`.
- `parentRunId`: the run whose agent code started this run, if there is one.
- `principal`: the user that the run runs for.

These three methods also read the log. After a restart, they still find each run, and a follow-up continues a run that ended before the restart. See [Durable sessions](./durable-sessions).

A run and all of its follow-ups keep their messages in one thread: `<threadId>:<name>:<input id of the first run>`. So each follow-up reads the full history of the runs before it.

### Start agents from agent code

An agent can start other agents in the background with `ctx.harness.agents.start(agent, input, options)`. It returns a run that you can await, message, and cancel:

```ts group=harness-subagents-messages
const editor = defineAgent({
  name: 'editor',
  description: 'Starts two drafts and joins them',
  run: async (ctx) => {
    const { agents } = ctx.harness
    const intro = agents.start(drafter)
    const outro = agents.start(drafter)
    await intro.send('Keep it under 100 words.')
    return [await intro, await outro].join('\n\n')
  },
})
```

- The agent must run in a session: from `session.agents`, from `ctx.agents` in a plugin, or as a background child. Outside a session run, `start` throws.
- Each child counts against the tree budget of the harness: `maxDepth`, `maxConcurrent`, and `maxCalls` in `subagents.limits`. Over the budget, `start` throws and no child starts. See [Stay within limits](#stay-within-limits).
- Each child runs for the sender of its parent run. Its `agentRuns()` item has the `parentRunId` of that run.
- A cancel of a run stops its children first, then the run.
- A cancel of a follow-up that did not start yet removes it. It never runs.

### Messages after a host stop

When the host stops during a run, the messages that wait for the run are in the log:

- If the run started with `resume: true`, the next host runs it again. The resumed run gets the messages that waited for it.
- If the run started without `resume`, the waiting messages settle `aborted`. A steer that already joined the run settles `failed`, with the run.

### Known limits

- A run that another host runs is in `agentRuns()`, but it takes no message. `send` with `to` gets `not_running`.
- A follow-up waits for its run. If that run had already ended when the host stopped, the follow-up settles `aborted`.

## Let the model run agents in the background

Each agent in `subagents.agents` is a tool of the main model, with the name of the agent. In a long session, the model can need a follow-up from a child that it started earlier. It can also need to start slow work and answer the user while the work runs. A harness gives each agent tool both:

```ts group=harness-subagents-tools
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
  subagents: { agents: [researcher, writer] },
})
```

The model gets a `researcher` tool and a `writer` tool. Each tool takes these fields:

- The fields of the agent's `inputSchema`, for example `question`. For an agent without `inputSchema`, `prompt`: the task as text.
- `sessionId`: the `subagentRunId` of an earlier result. The call continues that child. It needs no more setup, because the session stores each child.
- `background`: `true` gives the model `{ subagentRunId, result: { status: 'started' } }` at once. The child runs as a background agent of the session.

For the tool input in plain `chat()`, see [The tool input](../chat/subagents#the-tool-input).

When a background child ends, the session starts a new turn. Its message starts with `Background agent researcher finished:` or `Background agent researcher failed:`. While the child runs, it is in `session.agentRuns()`.

With a session index, each child gets an entry with its `parentThreadId` and `parentToolCallId`. See [Turn on the session index](./sessions#turn-on-the-session-index).

The `subagents` option of a harness has no `binding` and no `keys`, because the session binds its own provider keys.

Known limits:

- A background child cannot be continued by its `sessionId`. If the model needs follow-ups, start the child without `background`.
- Only the turns of the session can start a background child. A child that calls an agent tool with `background` gets the tool error `background needs a host that runs children in the background.`
- A call with `background` and `sessionId` gets the tool error `background cannot continue a sessionId.`

## Show what a child wrote after a reload

Your UI shows each child's text and tool calls while they stream. Then the user reloads the page. The thread's transcript has only the agent tool call and its result, because each child keeps its own messages. `session.agentTranscript(subagentRunId)` gives you those messages back.

Each agent tool result names its child with `subagentRunId`. Read the result, then ask for the child:

```ts group=harness-subagents-transcript
import { defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const writer = defineAgent({
  name: 'writer',
  description: 'Writes and edits drafts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol'), stream: false }),
})

const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [writer] },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(studio, { threadId: 'user-1-thread' })
await session.send('Write a short intro, then have the writer edit it.')

for (const message of await session.transcript()) {
  if (message.role !== 'tool' || typeof message.content !== 'string') continue
  const result: unknown = JSON.parse(message.content)
  if (typeof result !== 'object' || result === null) continue
  if (!('subagentRunId' in result)) continue
  if (typeof result.subagentRunId !== 'string') continue

  const child = await session.agentTranscript(result.subagentRunId)
  console.log(child.map((item) => item.content))
}
```

What you get back:

- The first message is the task that the model gave the agent.
- Each message has the child's card in `metadata.tanstack.subagent`: its `name` and its `status` (`running`, `finished`, `error`, or `suspended`).
- A child that failed before it wrote anything gives you one empty message. It holds only the card, so you can still show that it failed.
- A nested child works the same way. Pass its own `subagentRunId`.

In the browser, `client.agentTranscript` reads the same messages through [your handler](./connect):

```ts group=harness-subagents-transcript-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { studio } from './harness'

const client = createHarnessClient<typeof studio>({
  url: '/api/harness',
  threadId: 'user-1-thread',
  headers: { authorization: 'Bearer my-token' },
})

export async function childMessages(subagentRunId: string) {
  return client.agentTranscript(subagentRunId)
}
```

You get an empty list when the id is unknown, or when the child belongs to another thread. The id can come from a prompt, so a session never reads the children of another thread. A [fork](./fork-and-reset) copies the agent results, but their children stay with the thread that ran them. So in the fork, `agentTranscript` gives an empty list for them.

## Route a turn to an agent

Your harness has a writer and a pricer, but the main model answers every turn. Add `routing.router` to send a turn to the agent that can answer it. The router runs at the start of each new turn: a new message, a follow-up, or the wake turn of a background agent.

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
- `route.pick(result, { inputs })` gives each agent its input. If a picked agent with a schema has no input, `pick` throws `Agent "pricer" needs input. Pass it in inputs.`

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

See [Limit the tree](../chat/subagents#limit-the-tree) for what each limit does.

## What you have now

- Commands and plugins that start typed agents, alone or in groups, and message them while they run.
- Background agents that continue on the next host after a crash, with steps that do not run twice.
- A tool for each agent that continues a child or starts it in the background.
- A router that sends each turn to the right agent, and gives each agent its input.
- Harnesses that call other harnesses as tools, in a tree that stays within limits.
