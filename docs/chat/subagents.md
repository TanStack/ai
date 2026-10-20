---
title: Subagents
id: subagents
order: 4
description: "Delegate a turn to a named child agent. The stream tags that work with AG-UI subagent events, and the UI shows a nested part."
keywords:
  - tanstack ai
  - subagents
  - defineAgent
  - router
  - sandbox
  - AG-UI
---

You want a specialist to handle some turns (research, writing, a sandbox harness) while the parent chat stays one conversation. `chat({ subagents })` lets the parent start a child. A router can still keep the turn on the parent, and without a router the model can skip the child tool. When a child starts, the stream tags its events with `subagentRunId`, and the client stores the work in a `type: 'subagent'` part.

Want a Start app with a researcher, an SEO agent, and a writer, routed by Jev? Open the [Subagents tutorial](../tutorials/subagents).

## Define a child

`run` is a `chat()` call. The child can use tools, MCP, interrupts, and its own nested `subagents`.

```ts group=subagents
import { chat, choice, decide, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const messages = [{ role: 'user' as const, content: 'Capital of France?' }]

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts and sources',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-5.6'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
})
```

Pass every `ctx` field to the child `chat()`. A child that stops for an approval needs `parentRunId` and `resume` to continue. See [Interrupts in a child](#interrupts-in-a-child).

## Route, or let the model pick

All spawn options live on `subagents`. Do not put `agents` or `router` on the root of `chat()`.

**With a router.** The library calls your function, then starts that agent. It does not send subagent tools to the model.

```ts group=subagents
const stream = chat({
  adapter: openaiText('gpt-5.6'),
  messages,
  subagents: {
    agents: [researcher],
    strategy: 'exclusive',
    router: async ({ agents }) => {
      const result = await decide({
        adapter: typesafeDecider('jev-latest'),
        state: messages,
        questions: {
          target: choice({
            instructions: 'Who must handle this turn?',
            options: {
              main: 'General chat',
              ...Object.fromEntries(
                agents.map((agent) => [agent.name, agent.description]),
              ),
            },
          }),
        },
      })
      return result.target.value
    },
  },
})
```

`choice` options must include `main` plus every agent name.

The router can return:

- `'main'`
- one agent name
- an array of names
- `{ names, order }`
- `{ steps }`

Anywhere a name goes, `{ name, input }` can go too, for example `{ name: 'pricer', input: { vendor: 'Acme' } }`. An agent with `inputSchema` needs it. No other agent takes an input. `chat()` throws when the pick breaks either rule.

One step holds one input for each agent. To give one agent two inputs, put each pick in its own step of `{ steps }`.

`subagents.order` is the default for an array. `parallel` starts the names together. `sequence` runs them one after another, and each later child reads the earlier child text. Omit `order` to get `parallel`.

`subagentRoute` asks Jev for the order. Jev picks `parallel` when no agent must read text from another agent. The same topic is not a reason to wait. Jev picks `sequence` only when a later agent must read the earlier text, such as research notes and then a draft.

`{ names, order }` overrides that default for one turn. Use it when some turns are parallel and some are serial.

`{ steps }` runs one group, then the next group. Each group has `names` and an optional `order`. The next group reads the text from the earlier group. Use this when two agents start together and a later agent must read both.

A later user message can also read that child text. The assistant message keeps each child's name and text, so the next turn still has the notes.

```ts
const plan = {
  steps: [
    { names: ['researcher', 'seo'], order: 'parallel' },
    { names: ['writer'] },
  ],
}
```

`subagentRoute(agents, { then: ['writer'] })` builds that plan when the writer is selected with other agents. The other names start together. The writer runs after them and reads their text. `then` does not have to list every agent.

Pass the router's `agents` argument to `subagentRoute`. Each yes/no question uses that agent's `description`. Pass `when` only when you need different question text. `when` must include every agent name. `pick` returns `main`, one name, `{ names, order }`, or `{ steps }`. Names follow that `agents` array.

```ts
import { chat, decide, defineAgent, subagentRoute } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: async function* () {},
})
const writer = defineAgent({
  name: 'writer',
  description: 'Writes the post',
  run: async function* () {},
})
const messages = [
  { role: 'user' as const, content: 'Research squids and write an article' },
]

const stream = chat({
  adapter: openaiText('gpt-5.6'),
  messages,
  subagents: {
    agents: [researcher, writer],
    router: async ({ messages: turnMessages, agents }) => {
      const state = turnMessages.at(-1)
      if (state === undefined) {
        throw new Error('No message')
      }
      const route = subagentRoute(agents)
      const result = await decide({
        adapter: typesafeDecider('jev-latest'),
        state,
        questions: route.questions,
      })
      return route.pick(result)
    },
  },
})
```

**Give a routed agent its input.** An agent with `inputSchema` gets its input from the router. `route.needsInput(result)` lists the picked agents that need one, each with its schema. Make each input. Then pass them to `route.pick(result, { inputs })`. Here the model writes each input, with the schema as `outputSchema`:

```ts
import { chat, decide, defineAgent, subagentRoute } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { typesafeDecider } from '@tanstack/ai-typesafe'
import { z } from 'zod'

const writer = defineAgent({
  name: 'writer',
  description: 'Writes the post',
  run: async function* () {},
})
const pricer = defineAgent({
  name: 'pricer',
  description: 'Compares the plans and prices of one vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: `Compare the plans of ${ctx.input.vendor}` }],
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
})
const messages = [
  { role: 'user' as const, content: 'What does Acme cost? Write a post about it.' },
]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  subagents: {
    agents: [pricer, writer],
    router: async ({ messages: turnMessages, agents }) => {
      const route = subagentRoute(agents, { then: ['writer'] })
      const result = await decide({
        adapter: typesafeDecider('jev-latest'),
        state: turnMessages,
        questions: route.questions,
      })
      const inputs = Object.fromEntries(
        await Promise.all(
          route.needsInput(result).map(async ({ name, inputSchema }) => [
            name,
            await chat({
              adapter: openaiText('gpt-6.1-sol'),
              messages: turnMessages,
              outputSchema: inputSchema,
            }),
          ]),
        ),
      )
      return route.pick(result, { inputs })
    },
  },
})
```

- `pick` types `inputs` when you write it as an object, such as `{ pricer: { vendor: 'Acme' } }`. Each key is the name of an agent with `inputSchema`, and the value has the type of that schema. `Object.fromEntries` returns `any`, so the sample above has no such check.
- If a picked agent with a schema has no input, `pick` throws `Agent "pricer" needs input. Pass it in inputs.`
- `chat()` checks each input against the schema before any child starts. If one input does not match, `chat()` throws, and no child starts. The `inputSchema` must be a Standard Schema, such as a zod schema. If it is a plain JSON Schema, `chat()` throws.
- `run` reads the input as `ctx.input`. The input stays on the server. It does not go to the client.
- A turn with a router input cannot resume after an interrupt. Do not give a tool that needs approval, or a client tool, to an agent in such a turn.

**Without a router.** The library adds one synthetic server tool per agent. The main model calls that tool. The public stream still emits `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` (or `SUBAGENT_ERROR`) and nested parts. The UI does not treat spawn as a normal tool card. The child's events stream while the tool runs, and the child's text becomes the tool result. The child reads the conversation as it is at that tool call. The model can also pass the task as `prompt`. The child gets it as the last user message. For all fields of the tool input, see [The tool input](#the-tool-input).

## Let the model write the brief

In a long thread, the child gets the full conversation at the tool call, with every earlier tool result. Each parallel child gets its own copy. The child must also find its task in that conversation.

Add `inputSchema` to the agent. The main model then writes the child's input when it calls the tool. `run` reads that input as `ctx.input`:

```ts
import { chat, defineAgent } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const messages = [
  { role: 'user' as const, content: 'Compare pricing for the vendors we picked' },
]

const researcher = defineAgent({
  name: 'researcher',
  description: 'Researches one focused question and returns sourced findings',
  inputSchema: z.object({
    task: z
      .string()
      .describe('What to find and what to return. The researcher sees only this text.'),
  }),
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-5.6'),
      messages: [{ role: 'user', content: ctx.input.task }],
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    }),
})

const stream = chat({
  adapter: openaiText('gpt-5.6'),
  messages,
  subagents: { agents: [researcher] },
})
```

- `ctx.input` has the type of the schema. Here it is `{ task: string }`.
- If the input does not match the schema, the model gets a tool error and can call the tool again. The child does not start.
- `ctx.messages` still holds the parent conversation. Add parts of it when the child needs more context.
- A resumed child gets the same `ctx.input` as the first run.
- With `subagents.router`, the router gives the input. See [Route, or let the model pick](#route-or-let-the-model-pick).

To show the brief in the UI, see [Show the brief on a card](#show-the-brief-on-a-card).

## Continue a child

Each tool call starts a new child. Sometimes the model must send a follow-up to a child that already answered, like "make it shorter". Add `withPersistence` to the parent `chat()`. Each result then gives the model the `subagentRunId` of the child, and the model continues that child with `sessionId`.

```ts
import {
  chat,
  chatParamsFromRequest,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'

const writer = defineAgent({
  name: 'writer',
  description: 'Writes and edits drafts',
  run: (ctx) => ctx.chat({ adapter: openaiText('gpt-6.1-sol') }),
})

// A continued child loads from this store. Use a durable backend in production.
const persistence = memoryPersistence()

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    middleware: [withPersistence(persistence)],
    subagents: { agents: [writer] },
  })
  return toServerSentEventsResponse(stream)
}
```

The model continues the writer like this:

1. The model calls `writer` with `{ "prompt": "Draft a post about tides" }`.
2. It gets `{ "subagentRunId": "subagent-1767225600000-x7k2m9q", "result": "Tides rise twice a day..." }`.
3. In a later turn, it calls `writer` with `{ "sessionId": "subagent-1767225600000-x7k2m9q", "prompt": "Make it shorter" }`.

The writer gets the task of its first call, its stored transcript, then `Make it shorter` as the last user message. The stream uses the same `subagentRunId`, so the client shows the new work on the same card.

### The tool input

Every agent tool takes the agent's own fields, plus two more:

- The fields of `inputSchema`, for an agent with one. The tool checks them against the schema.
- `prompt`: the task as text, for an agent without `inputSchema`. The child gets it as the last user message.
- `sessionId`: the `subagentRunId` of an earlier result. The call continues that child. The tool has this field only when `withPersistence` is on the parent `chat()`.
- `background`: `true` starts the child and returns its `subagentRunId` at once. The tool has this field only when a host that runs agents for you, such as a [harness](../harness/subagents), turns it on. `maxConcurrent` counts that child until it ends.

When the run uses `sessionId` or `background`, that name is reserved. If an `inputSchema` has a field with that name, `chat()` throws before the run starts.

### Wrong calls

A wrong call goes back to the model as a tool error, and the run continues. For example:

- `Input validation failed for tool researcher: ...`: the fields do not match `inputSchema`.
- `Unknown sessionId "..."`: no child of this thread has that id. A thread can continue only its own children.
- `Session "..." belongs to agent "writer", not "researcher".`: the call must use the tool of the agent that ran the child.
- `background needs a host that runs children in the background.`

## Return a value, or call any activity

A child does not have to be a chat. It can make an image, or return a plain value that the parent model reads as the tool result. Call the activity on `ctx` and return what it gives you:

```ts group=subagent-values
import { chat, defineAgent } from '@tanstack/ai'
import { openaiImage, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const heroImage = defineAgent({
  name: 'heroImage',
  description: 'Makes a hero image for a post',
  produces: 'image',
  inputSchema: z.object({ prompt: z.string() }),
  run: (ctx) =>
    ctx.generateImage({
      adapter: openaiImage('gpt-image-2.5-sunburst'),
      prompt: `${ctx.input.prompt}. Brand colors: blue and white.`,
      size: '1536x1024',
    }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Make a hero image about squids' }],
  subagents: { agents: [heroImage] },
})
```

- `ctx.chat`, `ctx.generateImage`, `ctx.generateVideo`, `ctx.generateSpeech`, and the other activities on `ctx` take the same options as the plain functions. They fill in the thread id, a run id, and the abort signal.
- `ctx.chat` also uses the parent conversation (`ctx.messages`) when you do not pass `messages`.
- `run` can return a promise of any value. The value arrives on `SUBAGENT_FINISHED.result`, and the parent model gets it as the tool result.
- A string result also streams as the child's text, so the card shows it. The parent model gets the full string.
- The result of `ctx.chat({ stream: false })` streams like the chat stream: its text, usage, and interrupts reach the parent.
- Each `ctx.chat` call after the first one gets its own run id.
- A very long string in the result (for example a base64 image) reaches the parent model as a short note, `[omitted 5000 characters]`. The full value stays on `SUBAGENT_FINISHED.result`.
- `produces` says what the agent makes (`'image'`, `'text'`, and so on). It does not change how the agent runs.

When you call the plain `chat()` instead, spread `ctx.forward` to pass the child's ids and abort controller in one line:

```ts group=subagent-values
const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: ctx.messages,
      ...ctx.forward,
    }),
})
```

A child that `ctx.chat` starts gets the prompt cache retention of the parent call, unless the call sets its own `promptCache`.

## Limit the tree

A child can have children of its own, and a model can call a child many times. Set `limits` so one request cannot start an unbounded tree:

```ts group=subagent-values
const limited = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Research squids in depth' }],
  subagents: {
    agents: [researcher],
    limits: { maxDepth: 2, maxConcurrent: 3, maxCalls: 12, timeoutMs: 120_000 },
  },
})
```

- `maxDepth`: how deep the tree can grow. The first chat is depth 0.
- `maxCalls`: how many children the whole tree can start.
- `maxConcurrent`: how many children one run can have running at once.
- `timeoutMs`: how long one child can run. A child never gets more time than its parent has left.

The whole tree shares one budget. A child that calls `ctx.chat({ subagents })` passes it on, so a child cannot reset it. A refused start reaches the model as a tool error, for example `subagent limit reached (maxCalls 12)`.

- Set `limits` on the first `chat()`. A nested chat in a child uses that budget, so its own `limits` do not apply.
- A child that a router picks does not count against the limits. The children it starts do count, one level deeper.
- A child that runs past `timeoutMs` stops, and the model gets `subagent timed out after 120000 ms`.
- When the parent has no time left, the model gets `subagent limit reached (no time left)`.
- A limit of `timeoutMs: 0` gets `subagent limit reached (timeoutMs 0)`.

## Keys for agents

An agent that calls a model needs a provider key. An adapter such as `openaiText` reads its env var, for example `OPENAI_API_KEY`.

To use the key of the user, pass it on `subagents.keys`. The agent then builds its adapter with `ctx.keys`. See [Keys inside agents](../advanced/byok#keys-inside-agents).

## Strategy

- `exclusive` (default): the chosen child owns the turn. Main does not answer after it.
- `handoff`: the child streams first. Then main runs with the new child text in the messages.

The parent `RUN_FINISHED.usage` includes the token usage of every child.

## Interrupts in a child

Some child work needs a person first, for example deleting a file. Give that child tool `needsApproval: true`. The child stops, and the parent run ends with the child's interrupt. The client answers it like any other interrupt. The next run continues the same child.

1. Share one tool definition between the server and the client:

```typescript title="tools.ts"
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
})
```

2. Give the child the server tool. Pass the resume fields from the request to the parent `chat()`:

```typescript title="route.ts"
import {
  chat,
  chatParamsFromRequest,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { deleteFile } from './tools'

const cleaner = defineAgent({
  name: 'cleaner',
  description: 'Deletes old files',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-5.6'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
      tools: [deleteFile.server(({ path }: { path: string }) => ({ deleted: path }))],
    }),
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.6'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    subagents: { agents: [cleaner], router: () => 'cleaner' },
  })

  return toServerSentEventsResponse(stream)
}
```

3. Register the same definition on the client, and answer the interrupt:

```tsx title="cleanup-panel.tsx"
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deleteFile } from './tools'

export function CleanupPanel() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [deleteFile.client()],
  })

  return (
    <section>
      <button onClick={() => chat.sendMessage('Clean up old files')}>
        Clean up
      </button>
      {chat.interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <button key={interrupt.id} onClick={() => interrupt.resolveInterrupt(true)}>
            Approve delete
          </button>
        ) : null,
      )}
    </section>
  )
}
```

The resume uses the plan that the router picked in the first run. It does not call the router again. If the router gave an agent of that plan an input, the resume fails. While the child waits, its card has `status: 'suspended'` and `interruptIds`. After you approve, the card shows the tool result and the child's reply. Client tools in a child work the same way.

The same flow works without a router. The child's tool call stays open until the resume, then the parent model reads the child's result. The result content carries the child's output or error. It carries `subagentRunId` only when the model can continue the child: with a persistence store, or for a background child. Else the id stays in the subagent events.

## Middleware

A child is its own `chat()` call. Put the child's middleware in that call. The parent's middleware list does not reach the child.

Inside a child, the middleware context has `subagentRunId`. Use it to tell a child run from a top-level run, and to link a child trace to its card.

When the child calls `ctx.chat`, the context also has `subagentName`, the name of the agent. For a nested child, `parentSubagentRunId` is the id of the child that started it.

On a routed turn where a child runs and main does not, the parent's middleware does not run. Only `withPersistence` records that turn. A turn where main runs, including a handoff, runs the parent's middleware as usual.

## Run a child from code

A server job can run an agent with no parent chat turn. Pass a sink when the job must read a pause or the token counts.

```ts group=subagents
import {
  createSubagentId,
  createSubagentSink,
  runAgentStream,
} from '@tanstack/ai'

const subagentRunId = createSubagentId()
const sink = createSubagentSink()
for await (const chunk of runAgentStream(
  researcher,
  {
    input: undefined,
    messages: [{ role: 'user', content: 'Find three facts about squids' }],
    threadId: 'thread-1',
    runId: `job-1:${subagentRunId}`,
    parentRunId: 'job-1',
    subagentRunId,
  },
  sink,
)) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') console.log(chunk.delta)
}
```

The sink holds the pause and the token counts:

- `sink.interrupts` has the interrupt objects. The finished event has `interruptIds` only.
- `sink.usage` has one entry per model call.
- `runAgentStream` does not check `input`. If the agent has an `inputSchema`, check the input before the call.
- A failure ends as `SUBAGENT_ERROR`. The stream omits `RUN_STARTED`, `MESSAGES_SNAPSHOT`, and `RUN_FINISHED`.

After the loop, read `sink.interrupts` to show the pause.

## Persistence

Put `withPersistence` on the parent `chat()` only. The parent stores each child:

- the child run, linked to the parent run
- the full child transcript
- the child's pending interrupts
- the card status

A reload then shows every card, and a resume continues a waiting child. See [Subagent cards on reload](../persistence/chat-persistence#subagent-cards-on-reload).

Do not add `withPersistence` to a child `chat()` too. The child does not know that it runs as a subagent, so it stores the same child again under its own run and thread ids. Its interrupt records then conflict with the parent's records, and a reload can lose the pending approval.

## Sandbox

`withSandbox` keys the workspace by `threadId`. Set `subagents.sandbox` so the child gets the right thread id. Pass `ctx.threadId` into the child `chat()`.

Options:

- `'own'` (default): the child thread id is `${parentThreadId}:${name}`. The child gets its own workspace.
- `'inherit'`: the child thread id is the parent thread id. The child reuses the parent workspace when `lifecycle.reuse` is `'thread'`.

If `sandbox` is `'inherit'` and the router returns two or more names, `chat()` throws before start. Two children write the same files at the same time.

**Own workspace (default).** Each child works in isolation. Parallel children each get a workspace.

```ts
import { chat, defineAgent } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const messages = [{ role: 'user' as const, content: 'Fix the tests' }]
const threadId = 'parent-thread'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'none' },
    packageManager: 'pnpm',
  }),
  lifecycle: { reuse: 'thread' },
})

const coder = defineAgent({
  name: 'coder',
  description: 'Edits the repo in a sandbox',
  run: (ctx) =>
    chat({
      adapter: grokBuildText('grok-build'),
      messages: ctx.messages,
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
      middleware: [withSandbox(repoSandbox)],
    }),
})

const ownStream = chat({
  adapter: grokBuildText('grok-build'),
  messages,
  threadId,
  middleware: [withSandbox(repoSandbox)],
  subagents: {
    agents: [coder],
    sandbox: 'own',
    strategy: 'exclusive',
    router: () => 'coder',
  },
})

const inheritStream = chat({
  adapter: grokBuildText('grok-build'),
  messages,
  threadId,
  middleware: [withSandbox(repoSandbox)],
  subagents: {
    agents: [coder],
    sandbox: 'inherit',
    strategy: 'exclusive',
    router: () => 'coder',
  },
})
```

`ownStream` runs the child with `threadId` `parent-thread:coder`. `inheritStream` runs the child with `threadId` `parent-thread`, so `reuse: 'thread'` shares the parent workspace.

See [Sandboxes](../sandbox/overview) for `withSandbox` and `lifecycle.reuse`.

## Client

The nested `type: 'subagent'` part and `useChat().subagents[i]` are the same live object. Call `stop()` on either one. The client sets that child to error and aborts the current parent run. Later events for that id, and for its nested children, are ignored.

`part.subagent.messages` holds everything the child did:

- text and reasoning
- tool calls and tool results
- approval state on the child's tool calls
- nested children, as their own `subagent` parts

`part.subagent.status` is `'running'`, `'finished'`, `'error'`, or `'suspended'`. By default, the child messages use the same parts components as the parent. A card can replace them for its child. See [Style one child's parts](#style-one-childs-parts).

Use `createChatHook` from `@tanstack/ai-react/ui` when you want the factory to draw the cards. Pass the agents you give to `chat()` as `options.subagents`. The client reads each agent's `name`, `tools`, `interrupts`, and `outputSchema` for types. It does not call `run`. Register `subagentsComponents` for each agent name. Those components receive `SubagentProps` and `Parts`. Render `<Messages />`. The subagent card is a part of the assistant message. `<Subagents />` draws that same card for the live list. Pick one place for the card. If a started child has a name with no `subagentsComponents` entry, rendering that card throws.

When you render the parts yourself, pass the same agents to `useChat`. The hook uses them for types only. It does not call `run`.

```tsx
import { defineAgent } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: async function* () {},
})
const writer = defineAgent({
  name: 'writer',
  description: 'Drafts posts',
  run: async function* () {},
})

function Desk() {
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    subagents: [researcher, writer],
  })
  const part = chat.messages[0]?.parts[0]
  if (part?.type === 'subagent' && part.subagent.name === 'researcher') {
    return part.subagent.status
  }
  return null
}
```

`part.subagent.name` is `'researcher' | 'writer'`. After you check the name, that child's `messages` use the tools and output schema from that agent.

```tsx
import { defineAgent } from '@tanstack/ai'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import type { LayoutProps, SubagentProps } from '@tanstack/ai-react/ui'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts',
  run: async function* () {},
})
const writer = defineAgent({
  name: 'writer',
  description: 'Drafts posts',
  run: async function* () {},
})

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  subagents: [researcher, writer],
}

function SubagentCard({
  subagent,
  Parts,
}: SubagentProps<typeof chatOptions, 'researcher' | 'writer'>) {
  return (
    <section>
      <strong>{subagent.name}</strong>
      <span>{subagent.status}</span>
      {subagent.status === 'running' ? (
        <button type="button" onClick={() => subagent.stop?.()}>
          Stop
        </button>
      ) : null}
      <Parts />
    </section>
  )
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages, Input }: LayoutProps<typeof chatOptions>) => (
      <main>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
    input: function Input() {
      const chat = useChatContext()
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const field = event.currentTarget.elements.namedItem('message')
            if (!(field instanceof HTMLInputElement)) return
            void chat.sendMessage(field.value)
            field.value = ''
          }}
        >
          <input name="message" />
          <button type="submit">Send</button>
        </form>
      )
    },
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
  subagentsComponents: {
    researcher: SubagentCard,
    writer: SubagentCard,
  },
})

export function ChatScreen() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

`part.subagent` is the same object as `useChat().subagents[i]` for that id. `stop()` on either one aborts the current parent run.

When `run` imports server code, do not import the agent into the browser. Declare the agent once in a shared file, with its `name`, `description`, and tool definitions from `toolDefinition`. The server passes `defineAgent({ ...researcher, run })` to `chat()`. The client passes the declaration.

### Show the brief on a card

When an agent has `inputSchema`, the card keeps the checked input that the parent model wrote, as `part.subagent.input`. Put `inputSchema` in the shared declaration, and pass the declaration to `useChat` to type it:

```typescript title="agents.ts"
import { z } from 'zod'

export const researcher = {
  name: 'researcher',
  description: 'Researches one focused question and returns sourced findings',
  inputSchema: z.object({ task: z.string() }),
} as const
```

```tsx title="briefs.tsx"
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { researcher } from './agents'

export function Briefs() {
  const { messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    subagents: [researcher],
  })
  return messages.flatMap((message) =>
    message.parts.map((part) =>
      part.type === 'subagent' ? (
        <p key={part.subagent.id}>{part.subagent.input?.task}</p>
      ) : null,
    ),
  )
}
```

- `part.subagent.input` is the same value as `ctx.input` in `run`, with the output type of the schema. Here it is `{ task: string } | undefined`.
- It is `undefined` for an agent without `inputSchema`. A router input stays on the server, so a child that a router started has no `part.subagent.input`.

### Style one child's parts

The researcher's reasoning and tool calls use the root widgets by default. To make them look different on the researcher card only, pass widgets to that card's `Parts`:

```tsx
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook, ThinkingPart } from '@tanstack/ai-react/ui'
import type { SubagentPartsProps, SubagentProps } from '@tanstack/ai-react/ui'
import { z } from 'zod'

const lookupWikipedia = toolDefinition({
  name: 'lookupWikipedia',
  description: 'Get the Wikipedia summary of one topic',
  inputSchema: z.object({ title: z.string() }),
  outputSchema: z.object({ extract: z.string() }),
})

// Shared with the server, which passes defineAgent({ ...researcher, run }).
const researcher = {
  name: 'researcher',
  description: 'Looks up facts',
  tools: [lookupWikipedia],
} as const

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  subagents: [researcher],
}

type ResearcherWidgets = SubagentPartsProps<typeof chatOptions, 'researcher'>

const researcherParts: ResearcherWidgets['partsComponents'] = {
  thinking: ({ part }) => (
    <ThinkingPart content={part.content} className="research-notes" />
  ),
}

const researcherTools: ResearcherWidgets['toolsComponents'] = {
  lookupWikipedia: ({ part }) => (
    <details>
      <summary>
        {part.input?.title} ({part.state})
      </summary>
      {part.output?.extract}
    </details>
  ),
}

function Researcher({
  Parts,
}: SubagentProps<typeof chatOptions, 'researcher'>) {
  return (
    <section>
      <Parts partsComponents={researcherParts} toolsComponents={researcherTools} />
    </section>
  )
}

export const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages }) => (
      <main>
        <Messages />
      </main>
    ),
    message: ({ Parts }) => (
      <article>
        <Parts />
      </article>
    ),
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    thinking: ({ part }) => <ThinkingPart content={part.content} />,
    fallback: () => null,
  },
  subagentsComponents: { researcher: Researcher },
})
```

- An entry on `Parts` replaces the root entry with the same key, for this card and for the children nested in it.
- A key that you do not set uses the root entry. Here, `text` still uses the root widget.
- `toolsComponents` keys and props come from the agent's `tools`. `part.input` and `part.output` are typed, and a tool name that the agent does not have is a type error. A tool call with no entry at any level renders nothing.
- An approval for a child tool arrives as `interrupt` on that tool widget, typed from the tool. The root `interruptsComponents` also accepts the child's approval tools and the ids in the agent's `interrupts`.

Define these maps outside the component. A new object on each render makes every part in the card render again. An approval for a tool that only a card registers also shows in the root `<Interrupts />` list.

In the AI devtools, the Conversation tab shows each child as a card with its name and status. The card holds the child's steps, drawn the same way as the parent's steps. A new step starts after each tool result. The User view on the right shows the child's text and tool outputs.

When the server events reach the devtools (the `devtools()` plugin from `@tanstack/devtools-vite`), the child's steps are its real server iterations, with the model, the system prompts, and the token usage. Without the plugin, the steps come from the messages in the browser.

See [Stream Events](./stream-events) for `SUBAGENT_*` and `subagentRunId`.
