---
title: Run agents from a harness
id: harness-subagents
order: 14
description: "Start typed agents from plugins and agent code, in parallel or in series, with limits and budgets. Message them while they run, share state, route a turn to an agent, and call a whole harness as a child."
keywords:
  - tanstack ai
  - harness
  - subagents
  - agents
  - routing
  - limits
---

A review command needs an explorer to collect facts, then a reviewer to judge them. A research task needs three explorers at once. In a harness, plugins, commands, and agents start agents from code, and a whole harness can be a child of another one. A router can also send a whole turn to an agent. Each run knows the run that started it, its user, its limits, and its budget, and the session log keeps all of it.

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
          const [auth, sessions] = await ctx.agents.group({ onFailure: 'cancel-siblings' }, (g) => [
            g.start(explorer, { task: `${topic}: auth checks` }),
            g.start(explorer, { task: `${topic}: session expiry` }),
          ])
          return `${auth}\n\n${sessions}`
        },
      }),
    },
  }),
})
```

- `ctx.agents.run(agent, input, options?)` runs one agent. Await it to get the result. It is an `AgentRun`, so you can also cancel it or send it a message.
- `ctx.agents.start(agent, input, { startTurnWhenDone: true })` runs it in the background and starts a turn when it finishes or fails.
- `ctx.agents.start(agent, input, { user })` runs it as that user. The wake turn runs as the same user.
- Without `user`, a plugin with `lifetime: 'turn'` starts it as the user of its turn. A session plugin starts it as the user who opened the session. To start it for the user of a tool call, pass `user: ctx.context.run.user`.
- In a tool that an agent run calls, `ctx.agents` starts the agent as a child of that run. It runs for the user of that run, and counts in its tree and budget. It takes no `maxConcurrent` slot, so the run can await it.
- When tools of two runs run at the same time, the plugin cannot tell which run calls it. Then pass `parent: ctx.context.run` to name the run.
- A `parent` that names no running agent run of this session throws: an unknown id, a run that ended, an older run of a chain, or a run that another host runs. A running turn is fine: in a tool of the main model, `parent: ctx.context.run` starts a root run.
- Pass `parent: null` to start a root run instead. It takes a `maxConcurrent` slot.
- `ctx.agents.group(options, (g) => runs)` runs several. See [Run agents in parallel or in series](#run-agents-in-parallel-or-in-series).

The input type comes from the `inputSchema` of the agent, and the result type comes from its output. A wrong input is a type error. An agent name instead of a definition gives a result of type `unknown`. `ctx.agents` in a plugin and `ctx.harness.agents` in agent code have the same type, `AgentActions`.

The turn that `startTurnWhenDone: true` starts sends the model a user message from the harness, for example `Background agent pricer finished: ...`. The user did not write it. So the transcript marks it with `metadata.harness.wake: true`, and a view from `createSessionView` does not show it. In your own chat UI, skip the user messages with this mark.

To track usage or apply a policy in each of these runs, see [Middleware in every agent](./plugins#middleware-in-every-agent).

The harness saves the images, audio, and video that these agents make. See [Media that agents make](./media#media-that-agents-make).

## Run agents in parallel or in series

A research agent has ten topics. It can explore them all at once, but your provider allows only two requests at a time. Run the explorers as a group with a `concurrency`:

```ts group=harness-subagents
const researcher = defineAgent({
  name: 'researcher',
  description: 'Explores each topic, two at a time',
  inputSchema: z.object({ topics: z.array(z.string()) }),
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const notes = await ctx.harness.agents.group({ concurrency: 2 }, (g) =>
      ctx.input.topics.map((topic) => g.start(explorer, { task: topic })),
    )
    return notes.join('\n\n')
  },
})
```

The body starts each child with `g.start` and returns the runs. `group` resolves to their results, in the same order. Every child that the body started settles before `group` returns.

- `concurrency`: how many children run at the same time. The others wait with the status `queued`, and use no budget until they start. The default is all of them.
- `onFailure: 'cancel-siblings'` (default): the first failure cancels the other children, also the ones that wait. Then `group` rejects with that error.
- `onFailure: 'collect'`: every child runs to its end. Each result is an `AgentSettled` entry: `{ ok: true, value }` or `{ ok: false, error }`.
- `key`: the name of the group in the run that starts it. See [Keep a background agent going after a crash](#keep-a-background-agent-going-after-a-crash).

To run agents in series, await each `run`. The next agent starts after the one before it ends:

```ts group=harness-subagents
const checker = defineAgent({
  name: 'checker',
  description: 'Explores a topic, then checks the notes',
  inputSchema: z.object({ topic: z.string() }),
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const { agents } = ctx.harness
    const notes = await agents.run(explorer, { task: ctx.input.topic })
    return await agents.run(explorer, { task: `Find the errors in these notes:\n${notes}` })
  },
})
```

## Keep a background agent going after a crash

A background agent can work for a long time. When its host stops, for example in a deploy, the next host fails the run. Start it with `runAgainAfterCrash: true`, and the next host runs it again instead. A background child that the model starts runs again by default (see [Let the model run agents in the background](#let-the-model-run-agents-in-the-background)):

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
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
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
          ctx.agents.start(migrator, { customer }, { runAgainAfterCrash: true, startTurnWhenDone: true })
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

`ctx.harness` gives the agent `step`, `agents`, and `state`. A harness gives it to every agent run in a session:

- A run that a session starts from code gets the full context. A background child that the model starts gets it too.
- An agent that the model calls as a tool, and an agent that a router picks, get `step`, `agents`, and `state`. Their steps keep their values while the turn waits for the agent. See [When an agent tool waits](#when-an-agent-tool-waits).
- An agent in a plain `chat()` has no harness, so `ctx.harness` is `undefined`. Check it before you use it, as the samples on this page do.

What the next host does:

- It runs the agent again with the same input. Its `ctx.chat` calls continue from the saved transcript, and its finished tool calls do not run again.
- A step runs at least once. A host can stop after `fn` ran and before the log stored its value. Then the next run calls `fn` again.
- After `durability.maxAttempts` runs (default 10), the run ends `failed` with the code `attempts_exhausted`. To set the limit for one run, pass `limits: { maxAttempts }`. See [Give one run a budget and a time limit](#give-one-run-a-budget-and-a-time-limit).
- `host.close()` cancels the run. A crash, a kill, or `host.close({ recoverable: true })` leaves the run for the next host.

### Children of a run that runs again

The agent code runs again from its start, so it calls `start`, `run`, and `group` again. The harness does not start those children a second time:

- A child that started before the host stopped is the same child. Its run gives the result that the log stored, or it goes on if it did not end.
- Only the children that did not start yet start now.
- The harness finds each child by its `key`. A call with no `key` is found by its place among the calls with no `key`: the order of the `start` and `run` calls, the order of the `group` calls, and the order of the children in each group.
- When the log has another agent at that place or key, the start throws.
- A background child that outlives its parent keeps its steps and finished tool calls.

If the order of the `start`, `run`, or `group` calls can change between runs, give each call a `key`. The children in one group always keep their order:

```ts group=harness-subagents
const auditor = defineAgent({
  name: 'auditor',
  description: 'Explores the services, then writes a summary',
  inputSchema: z.object({ services: z.array(z.string()) }),
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const { agents } = ctx.harness
    const notes = await agents.group({ key: 'services' }, (g) =>
      ctx.input.services.map((service) => g.start(explorer, { task: service })),
    )
    return await agents.run(explorer, { task: `Summarize:\n${notes.join('\n')}` }, { key: 'summary' })
  },
})
```

This works only for a run that started with `runAgainAfterCrash: true`, because only that run runs again on the next host.

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

Who sends:

- `run.send` and `run.cancel` act as the user of the run, not as the user who opened the session.
- To send as another user, pass `user`: `run.send('Add a title.', { user })`.
- `session.agents.drafter.run(input, { user })` and `start` run the agent as that user.

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

- `runId` (the same as `operationId`) and `agent`: the run and the name of its agent. `kind` is always `'agent'`.
- `subagentRunId`: the id of the run as a child of the thread, the same as `run.subagentRunId`. A run that runs again after a host stop keeps it. A run in the log that did not start yet has none.
- `status`: `running`, `queued`, `waiting`, `completed`, `failed`, or `cancelled`. A `queued` run did not start yet: it waits for a free slot, or it is a follow-up that waits for the run before it. A `waiting` run waits for an answer, see [When a background agent waits](#when-a-background-agent-waits).
- `parentRunId`: the run that started this run, if there is one. That is the agent run whose code started it, or the turn whose tool started it.
- `user`: the user that the run runs for. `budget`: the budget of the run, if it has one.
- `result` of a run that completed, and `error` (`{ message, code? }`) of a run that failed.

`agentRuns()` reads the run tree of the session. See [The run tree](#the-run-tree).

These three methods also read the log. After a restart, they still find each run, and a follow-up continues a run that ended before the restart. See [Durable sessions](./durable-sessions).

A run and all of its follow-ups keep their messages in one thread: `<threadId>:<name>:<input id of the first run>`. So each follow-up reads the full history of the runs before it. To read those messages, pass the run id or its `subagentRunId`:

```ts group=harness-subagents-messages
const history = await session.agentTranscript({ runId: run.id })
const same = await session.agentTranscript({ subagentRunId: run.subagentRunId })
```

The list starts with the messages that the first run started from. See [Show what a child wrote after a reload](#show-what-a-child-wrote-after-a-reload).

### Start agents from agent code

An agent can start other agents in the background with `ctx.harness.agents.start(agent, input, options?)`. It returns a run that you can await, message, and cancel. `run` and `group` work here too, as in [Run agents in parallel or in series](#run-agents-in-parallel-or-in-series):

```ts group=harness-subagents-messages
const editor = defineAgent({
  name: 'editor',
  description: 'Starts two drafts and joins them',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const { agents } = ctx.harness
    const intro = agents.start(drafter)
    const outro = agents.start(drafter)
    await intro.send('Keep it under 100 words.')
    return [await intro, await outro].join('\n\n')
  },
})
```

- The agent must run in a session. Outside a session, `start` throws.
- Each child counts against the limits of its tree. Over a limit, `start` throws and no child starts. See [Stay within limits](#stay-within-limits).
- Each child gets the user, the keys, and the signal of its parent run. See [What a child gets from its parent](#what-a-child-gets-from-its-parent).
- A cancel of a run stops its children first, then the run.
- A cancel of a follow-up that did not start yet removes it. It never runs.

### What a child gets from its parent

A child run acts for the same person as the run that started it, and it stops when that run is stopped:

- The child runs for the user of its parent run, with that user's credentials and provider keys. Its `agentRuns()` item has the `parentRunId` of the parent.
- A cancel, a timeout, or a budget stop of the parent also stops the child.
- A parent that completes leaves its background children running.
- A host stop for a deploy (`host.close({ recoverable: true })`) gives the child back for the next host. It does not cancel the child.
- A cancel of a turn also cancels the background runs that the turn started.

A background run that a turn starts keeps the plugins of that turn, for example the `agentMiddleware` of a plugin with `lifetime: 'turn'`. The turn plugins are cleaned up when the turn and every run that it started have settled, or when the session closes.

### Messages after a host stop

When the host stops during a run, the messages that wait for the run are in the log:

- If the run started with `runAgainAfterCrash: true`, the next host runs it again. The resumed run gets the messages that waited for it.
- If the run started without `runAgainAfterCrash`, the waiting messages settle `aborted`. A steer that already joined the run settles `failed`, with the run.

### When a background agent waits

A background run can need a person, for example an approval of [`permissions()`](./permissions) before it edits a file. The run then stops with status `waiting`. Its wait is in `session.snapshot().pendingWaits`, with the `runId` of the run:

```ts group=harness-subagents-messages
const [wait] = session.snapshot().pendingWaits.filter(
  (open) => open.runId === run.id,
)
if (wait) {
  await session.resolve({
    resume: [{ interruptId: wait.waitId, status: 'resolved', payload: 'once' }],
  })
}
```

- The run continues after every wait of the run has an answer.
- The log keeps the wait, so no host stays busy. An answer on any host, also after a restart, continues the run.
- A run that started with `runAgainAfterCrash: true` can also ask with `ctx.harness.step.ask`. See [Wait for a person](./waits).
- The `question` tool belongs to the lead turn. Agent runs do not get it.
- An agent that the model calls as a tool inside a turn waits with the turn. See [When an agent tool waits](#when-an-agent-tool-waits).

### Known limits

- A run that another host runs is in `agentRuns()`. `send` with `to` gives the message to that host's run. A run that no host runs gets `not_running`.
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

When the host stops while a background child runs, or before the child starts, the next host continues the child with the same `subagentRunId`, as a start with `runAgainAfterCrash: true` does:

- The agent code runs again from its start.
- `ctx.chat` continues from the saved transcript. A tool call that finished does not run again. A tool call that ran at the stop runs again.
- `ctx.harness.step.do` keeps its values, so a finished step does not run again.
- The plugins with `lifetime: 'turn'` of the turn that started the child are gone.

To fail a child that ran at the stop instead, set `durability: { resumeBackgroundAgents: false }` in `defineHarness`. A child that did not start yet still starts, because none of its code ran.

With a session index, each child gets an entry with its `parentThreadId` and `parentToolCallId`. See [Turn on the session index](./sessions#turn-on-the-session-index).

The `subagents` option of a harness has no `binding` and no `keys`, because the session binds its own provider keys.

Known limits:

- A background child cannot be continued by its `sessionId`. If the model needs follow-ups, start the child without `background`.
- Only the turns of the session can start a background child. A child that calls an agent tool with `background` gets the tool error `background needs a host that runs children in the background.`
- A call with `background` and `sessionId` gets the tool error `background cannot continue a sessionId.`

## When an agent tool waits

The main model calls a `writer` agent as a tool, and the writer wants to save a file. [`permissions()`](./permissions) asks the user first. The turn stops for that approval, and the writer goes on after the answer:

```ts group=harness-subagents-waits
import { writeFile } from 'node:fs/promises'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'

const saveFile = toolDefinition({
  name: 'save_file',
  description: 'Write a file',
  inputSchema: z.object({ path: z.string(), text: z.string() }),
}).server(async ({ path, text }) => {
  await writeFile(path, text)
  return `Saved ${path}.`
})

const writer = defineAgent({
  name: 'writer',
  description: 'Writes files',
  run: (ctx) =>
    ctx.chat({ adapter: openaiText('gpt-6.1-sol'), tools: [saveFile], stream: false }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [writer] },
  plugins: () => [permissions({ rules: [{ tool: 'save_file', decision: 'ask' }] })],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(studio, { threadId: 'user-1-thread' })
await session.send('Write a short README.')

const waits = session.snapshot().pendingWaits
for (const wait of waits) console.log(wait.kind, wait.agent) // approval writer

await session.resolve({
  resume: waits.map((wait) => ({
    interruptId: wait.waitId,
    status: 'resolved',
    payload: 'once',
  })),
})
```

- Each wait of the agent has `turn: true`, the `agent` name, and the `subagentRunId` of the agent run. For a nested agent, `agent` is the agent that waits.
- One `resolve` answers every wait of the turn. The agent goes on from where it stopped, and the main model gets its result as the tool result.
- The other waits of the agent work the same way: a sign-in, an interrupt of `defineInterrupt`, a client tool, and `ctx.harness.step.ask`.
- The log keeps the stopped agent. An answer on any host, also after a restart, continues it.
- With `durability: { agentToolWaits: false }`, an agent tool does not wait. A call of it that needs an approval gets a tool error, and `step.ask` throws.

### Ask from agent code

Agent code asks the user with `ctx.harness.step.ask`. The question is a wait of the turn, and you answer it with `resolve`:

```ts group=harness-subagents-waits
const namer = defineAgent({
  name: 'namer',
  description: 'Names a project',
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const { step } = ctx.harness
    const audience = await step.ask({
      name: 'audience',
      message: 'Who reads the project?',
      schema: z.string(),
    })
    return step.do('name', () => `A name for ${audience}`)
  },
})
```

The `resolve` runs the agent code again from its start. An answered `step.ask` returns its answer, and a finished `step.do` returns its stored value.

Known limits:

- A `step.ask` with `secret: true` throws here. Ask for a secret in a [durable tool](./durable-tools) or a background run.
- `expiresAt` of a `step.ask` has no effect here.
- The wait does not get the `url` of a `step.ask`. Put the link in `message`.
- A crash while the agent runs (not while it waits) gives the main model a tool error. The agent does not run again.

## Show what a child wrote after a reload

Your UI shows each child's text and tool calls while they stream. Then the user reloads the page. The thread's transcript has only the agent tool call and its result, because each child keeps its own messages. `session.agentTranscript({ subagentRunId })` gives you those messages back.

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

  const child = await session.agentTranscript({ subagentRunId: result.subagentRunId })
  console.log(child.map((item) => item.content))
}
```

What you get back:

- The first message is the task that the model gave the agent.
- Each message has the child's card in `metadata.tanstack.subagent`: its `name` and its `status` (`running`, `finished`, `error`, or `suspended`).
- A child that failed before it wrote anything gives you one empty message. It holds only the card, so you can still show that it failed.
- A nested child works the same way. Pass its own `subagentRunId`.
- A background child (`background: true`) and an agent run that code starts give the messages of their chain thread. See [Find a run by its id](#find-a-run-by-its-id). For those, `{ runId }` works too.

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
  return client.agentTranscript({ subagentRunId })
}
```

The handler route is `GET .../agent-transcript?threadId=&subagentRunId=`, or `&runId=` for a run id.

You get an empty list when the id is unknown, or when the child belongs to another thread. The id can come from a prompt, so a session never reads the children of another thread. A [fork](./fork-and-reset) copies the agent results, but their children stay with the thread that ran them. So in the fork, `agentTranscript` gives an empty list for them.

## Route a turn to an agent

Your harness has a writer and a pricer, but the main model answers every turn. Add `routing.router` to send a turn to the agent that can answer it. The router runs at the start of each new turn: a new message, a follow-up, or the wake turn of a background agent.

```ts group=harness-routing
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

The router also gets `session`, the `input` of the turn as the user sent it, `operationId`, `inputId`, `abortSignal`, `activeAgent`, and `model`. Next to `router`, `routing` takes `order`, `limits`, `sandbox`, `afterAgentsAnswer`, `allowHandoffToHuman`, and `giveModelsHandoffTool`. The first three work the same as in `subagents`. `giveModelsHandoffTool: false` gives no model the `handoff` tool. See [Hand off a conversation](./handoffs).

### Count the model calls of the router

Your router asks a model which agent fits. A plain `chat()` call does not count in `session.usage()`, and it keeps running after the user cancels the turn. Call the model with `model.chat` instead:

```ts group=harness-routing
export const helpdesk = defineHarness({
  name: 'acme/helpdesk',
  adapter: openaiText('gpt-6.1-sol'),
  agents: [writer, pricer],
  routing: {
    router: async ({ model, messages }) => {
      const { text } = await model.chat({
        label: 'pick',
        options: {
          messages,
          systemPrompts: ['Answer "writer" for a blog post, else "main". Answer one word.'],
        },
      })
      return text.trim() === 'writer' ? 'writer' : 'main'
    },
  },
})
```

- `model.chat` takes the same options as [`ctx.model.chat`](./plugins#call-a-model-from-a-plugin) of a plugin. Without `adapter`, it uses the thread setting `model`, else the harness `adapter`.
- The call uses the keys of the sender of the turn. A cancel of the turn stops it.
- Its usage counts in the turn, and in the session under `router`. See [Usage of the router and transfers](./usage#usage-of-the-router-and-transfers).

What the turn does with the pick:

- `'main'`: the main model answers, with its `subagents` as usual.
- Agent names: only those agents run. The harness does not call the main model. The turn text is their answer as the transcript keeps it, for example `pricer:\n...`.
- `afterAgentsAnswer: 'main-answers'`: the agents run first. Then the main model answers in the same turn. It reads their text and keeps its subagent tools. With the default, `afterAgentsAnswer: 'end-turn'`, the turn ends after the agents.
- An interrupt in a routed agent ends the turn. `session.resolve` continues the same plan, and it does not call the router again.

A routed agent works like the main model in a turn:

- A steer that you send during the turn joins the next model call of the picked agent.
- If the agents already made their last model call, they run again with the steer, in the same turn. This late join does not call the router.
- `turn.beforeFinish` and `turn.onModelError` run for the routed agents too.
- Each answer of an agent stays in the transcript as its own message, also when the agent runs again or hands off to another agent.

Some limits:

- An agent that makes no model call, for example plain code in `run`, gets a steer only as a late join.
- When several agents run in parallel, the first one takes the steer.
- With `afterAgentsAnswer: 'main-answers'`, the main model takes no steer. A steer sent during its part runs as its own turn, and the router picks for that turn too.
- After `session.resolve` continues a plan, the agents do not run again for a late join or a turn hook.

### Keep the agent that answers

A user works with the writer for five turns. The router does not have to pick the writer again each time. The log keeps the active agent, and the router reads it as `activeAgent`:

```ts group=harness-routing
export const desk = defineHarness({
  name: 'acme/desk',
  adapter: openaiText('gpt-6.1-sol'),
  agents: [writer, pricer],
  routing: {
    router: ({ activeAgent, input }) => {
      if (input === 'Thanks, that is all.') return 'main'
      if (activeAgent === undefined && typeof input === 'string' && input.includes('blog')) {
        return { handoff: 'writer', note: 'The user wants a blog post.' }
      }
      return undefined
    },
  },
})
```

How each pick changes the active agent:

- `undefined`: the active agent answers. With no active agent, the main model answers.
- One agent name: that agent answers, and it becomes the active agent.
- `'main'`: the main model answers, and no agent is active.
- `{ handoff, note }`: the log keeps the note in a `harness.handoff` record. Then the target answers, and it becomes the active agent. `handoff: 'main'` clears it.
- `{ name, input }`, a list, `{ names }`, or `{ steps }`: those agents answer. The active agent does not change.

Agents can also hand the turn to each other, or to a person. See [Hand off a conversation](./handoffs).

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

In a session, the child is a run of the session tree. It opens a session of the child harness on its own thread, `<root thread id>/agent/<run id>`, in the log of the root thread. The child gets these from the run that calls it:

- The user, with that user's credentials and provider keys.
- The budget of the parent run. The model calls of the child count against it.

What you see in the parent session:

- The model calls of the child count in `session.usage()` and in the budget of the parent.
- A wait of the child, for example a sign-in or an approval, is in `snapshot().pendingWaits` of the root session. Answer it there, and the child goes on in the parent run. The receipt names the parent run, so a `POST run` resume streams that run to its end. A wait that expires lets the child go on by itself. Every host sees the wait, and so does `host.observe`, because it is in the log of the root thread. An answer on another host goes to the host that runs the child. A child that waits keeps its parent run running. If the host of the child stops, no host runs the child again. The next host that owns the log ends the waits of that child as `cancelled`.
- The events of the child (text, reasoning, tool calls, and custom events) reach the parent stream with `parentRunId` in `metadata.tanstack`. A last `RUN_FINISHED` has the total usage of the child.
- The child session closes, and its plugins are cleaned up, when the run settles.

Outside a session, for example in a plain `chat()`, `harnessAgent` runs the child harness on the host that you pass as `host`. Without `host`, it makes a host with a memory log the first time it runs.

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

See [Limit the tree](../chat/subagents#limit-the-tree) for what each limit does. In a harness session, they count like this:

- `maxDepth` and `maxCalls` count per tree. An agent that a session, a plugin, or a wake starts is the root of its own tree.
- `maxConcurrent` counts the root agent runs of the whole session, and the children of each run.
- Over `maxConcurrent`, a root start waits with the status `queued`. It starts when a slot is free. A run that waits for a person keeps its slot. A plugin start in a tool of an agent run is a child of that run, not a root, unless it passes `parent: null`.
- Over a limit, a child start throws, and no child starts. A child of a `group` with `concurrency` waits in its group instead.
- A start that fails before its run starts, for example with an unknown agent or an input that is not valid, gives its call back.

The log keeps the counts, so a restart does not reset them. A `queued` start also survives a host stop. The next host keeps its run id and its place in the order, and starts it when a slot is free. A start that was cancelled before the stop ends `cancelled`.

## Give one run a budget and a time limit

A drafter can loop on a hard task and use a lot of tokens. Give the run a budget and a time limit. When it goes over, the run fails, and the rest of the session goes on:

```ts group=harness-subagents-messages
const limited = session.agents.drafter.start(undefined, {
  limits: { timeoutMs: 5 * 60_000, maxAttempts: 3 },
  budget: { maxTokens: 50_000 },
  onModelError: { retries: 2 },
})

try {
  await limited
} catch {
  const info = session.agentRuns().find((item) => item.runId === limited.id)
  console.log(info?.error?.code) // 'budget' or 'timeout'
}
```

Every way to start an agent takes these options: `start`, `run`, and `g.start`, on `session.agents`, `ctx.agents`, and `ctx.harness.agents`.

- `limits.timeoutMs`: the run fails with the code `timeout` after this time. A run again on another host keeps the first deadline. The deadline is never later than the deadline of the parent run, or `durability.timeoutMs`.
- `limits.maxAttempts`: the attempts of this run. It replaces `durability.maxAttempts` for this run.
- `budget.maxTokens` and `budget.maxCost`: the model use of the run and of all its children. The check runs after each model call, so a run stops after the first model call over the budget. Then it fails with the code `budget`. A run with `runAgainAfterCrash: true` that runs again after a host stop also counts the model use of the runs before.
- `onModelError`: what to do when a model call of the run fails before it streams output. Only that model call runs again, so a tool that ran before does not run twice. One model call runs at most 3 times. A tool that throws, or an error in the agent code, does not count.

A budget holds for the whole tree under the run:

- A child never has more budget than its parent has left. A child start under a parent with no budget left throws.
- `maxCost` counts the cost that the providers report. A call with no reported cost adds nothing to it. See [Track usage and cost](./usage).

`onModelError` takes two forms:

- `{ retries: 1 | 2, transientOnly? }`: retry up to `retries` times, after a short backoff or the `retryAfterMs` of the error (up to 5 s). With `transientOnly` (default `true`), only an error that `isTransientModelError` finds transient retries. The log keeps this form, so a run that another host takes over or resumes retries too.
- A function that returns `'retry'` or `'fail'`. The log cannot keep a function. So a run that another host takes over runs without it, and that host logs one warning.

## The run tree

The log keeps every run of a session as a node of one tree. A node has the type `RunNode`:

- `runId` and `kind`: `turn`, `agent`, `tool`, or `command`.
- `status`: `queued`, `running`, `waiting`, `completed`, `failed`, or `cancelled`.
- `parentRunId`: the run that started it. A root run has none.
- `agent`, `user`, `key`, `limits`, and `budget`: what the run was started with.
- `result` and `error`: how the run ended.

`session.agentRuns()` lists the agent nodes. The tree comes from the log, so a second host lists the same runs, also after a restart. To read every node yourself, see [Find the runs in the log](./session-log#find-the-runs-in-the-log).

## Share state between agents

A crawler starts many agents, and each one must skip the pages that another agent already read. Give them a shared state with `ctx.harness.state`:

```ts group=harness-subagents
const reader = defineAgent({
  name: 'reader',
  description: 'Reads one page, once per session',
  inputSchema: z.object({ url: z.string() }),
  run: async (ctx) => {
    if (!ctx.harness) throw new Error('This agent must run in a harness.')
    const seen = ctx.harness.state<Array<string>>({ key: 'seen-urls', initial: [] })
    if ((await seen.get()).includes(ctx.input.url)) return 'Already read.'
    await seen.update((urls) => [...urls, ctx.input.url])
    return ctx.chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: `Summarize ${ctx.input.url}` }],
      stream: false,
    })
  },
})
```

- Every agent of one session that asks for the same `key` gets the same value. Before the first update, `get` gives `initial`.
- `get` and `update` work like [plugin state](./plugins#keep-state). The updates of one key run one at a time, and the value is JSON.
- The log keeps the value. It survives a restart, and a [fork](./fork-and-reset) copies it.
- Clients see each change in the AG-UI `STATE_SNAPSHOT` event, under `shared`. Plugin state is under `plugins`.
- An agent in a plain `chat()` has no `ctx.harness`, so it has no shared state.

## What you have now

- Plugins, commands, and agents that start typed agents, in parallel or in series, and message them while they run.
- Background agents that continue on the next host after a crash, with steps and children that do not run twice.
- Runs with their own budget and time limit, in a tree that stays within limits.
- A router that sends each turn to the right agent, and a routed agent that takes steers like the main model.
- Harnesses that call other harnesses as child runs, and agents that share state by key.
