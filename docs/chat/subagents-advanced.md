---
title: "Subagents: Advanced"
id: subagents-advanced
description: "Router plans, the agent tool input, value results, limits, middleware, sandboxes, and custom subagent cards."
keywords:
  - tanstack ai
  - subagents
  - defineAgent
  - subagentRoute
  - router
  - sandbox
---

This page covers the details of subagents that you need only for special cases. Set up the basics first with [Subagents](./subagents).

## Router picks

The router can return:

- `'main'`: the parent model answers the turn.
- One agent name.
- An array of names.
- `{ names, order }`: a list with its own order for this turn.
- `{ steps }`: groups that run one after another.

Anywhere a name goes, `{ name, input }` can go too, for example `{ name: 'pricer', input: { vendor: 'Acme' } }`. These rules apply:

- An agent with `inputSchema` needs an input.
- No other agent takes an input.
- If the pick breaks one of these rules, `chat()` throws.

One step holds one input for each agent. To give one agent two inputs, put each pick in its own step of `{ steps }`.

### Order

`subagents.order` is the default order for an array:

- `parallel` (default): the names start together.
- `sequence`: the names run one after another. Each later child reads the text of the earlier child.

`{ names, order }` overrides that default for one turn. If some turns are parallel and some are serial, use it.

`{ steps }` runs one group, then the next group. Each group has `names` and an optional `order`. The next group reads the text from the earlier group. If two agents start together and a later agent must read both, use `{ steps }`:

```ts
const plan = {
  steps: [
    { names: ['researcher', 'seo'], order: 'parallel' },
    { names: ['writer'] },
  ],
}
```

A later user message can also read that child text. The assistant message keeps the name and text of each child, so the next turn still has the notes.

### Build the plan with `subagentRoute`

`subagentRoute` makes one yes/no question for each agent and asks Jev for the order. Jev picks `parallel` when no agent must read text from another agent. The same topic is not a reason to wait. Jev picks `sequence` only when a later agent must read the earlier text, such as research notes and then a draft.

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
  adapter: openaiText('gpt-6.1-sol'),
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

- Pass the `agents` argument of the router to `subagentRoute`. Each yes/no question uses the `description` of that agent.
- If you need different question text, pass `when`. `when` must include every agent name.
- `pick` returns `main`, one name, `{ names, order }`, or `{ steps }`. The names follow the order of that `agents` array.
- `subagentRoute(agents, { then: ['writer'] })` puts the writer in a later step when it is selected with other agents. The other names start together. The writer runs after them and reads their text. `then` does not have to list every agent.

### Give a routed agent its input

An agent with `inputSchema` gets its input from the router:

1. `route.needsInput(result)` lists the picked agents that need an input, each with its schema.
2. Make each input.
3. Pass the inputs to `route.pick(result, { inputs })`.

Here the model writes each input, with the schema as `outputSchema`:

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

- `pick` types `inputs` when you write it as an object, such as `{ pricer: { vendor: 'Acme' } }`. Each key is the name of an agent with `inputSchema`, and the value has the type of that schema. `Object.fromEntries` returns `any`, so the sample above has no such type check.
- If a picked agent with a schema has no input, `pick` throws `Agent "pricer" needs input. Pass it in inputs.`
- `chat()` checks each input against the schema before any child starts. If one input does not match, `chat()` throws, and no child starts.
- The `inputSchema` must be a Standard Schema, such as a zod schema. If it is a plain JSON Schema, `chat()` throws.
- `run` reads the input as `ctx.input`. The input stays on the server. It does not go to the client.

> [!WARNING]
> A turn with a router input cannot resume after an interrupt. Do not give a tool that needs approval, or a client tool, to an agent in such a turn.

## The tool input

Without a router, every agent tool takes the fields of the agent, plus two more:

- The fields of `inputSchema`, for an agent with one. The tool checks them against the schema.
- `prompt`: the task as text, for an agent without `inputSchema`. The child gets it as the last user message.
- `sessionId`: the `subagentRunId` of an earlier result. The call continues that child. The tool has this field only when `withPersistence` is on the parent `chat()`.
- `background`: `true` starts the child and returns its `subagentRunId` at once. The tool has this field only when the host sets `subagents.binding.start`. The host returns `done`. `maxConcurrent` counts that child until `done` settles.

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

What the activities on `ctx` do:

- `ctx.chat`, `ctx.generateImage`, `ctx.generateVideo`, `ctx.generateSpeech`, and the other activities on `ctx` take the same options as the plain functions. They fill in the thread id, a run id, and the abort signal.
- `ctx.chat` also uses the parent conversation (`ctx.messages`) when you do not pass `messages`.
- Each `ctx.chat` call after the first one gets its own run id.
- A child that `ctx.chat` starts gets the prompt cache retention of the parent call, unless the call sets its own `promptCache`.

What happens to the result:

- `run` can return a promise of any value. The value arrives on `SUBAGENT_FINISHED.result`, and the parent model gets it as the tool result.
- A string result also streams as the text of the child, so the card shows it. The parent model gets the full string.
- The result of `ctx.chat({ stream: false })` streams like the chat stream. Its text, usage, and interrupts reach the parent.
- A very long string in the result (for example a base64 image) reaches the parent model as a short note, `[omitted 5000 characters]`. The full value stays on `SUBAGENT_FINISHED.result`.

`produces` says what the agent makes (`'image'`, `'text'`, and more). It does not change how the agent runs.

When you call the plain `chat()` instead, spread `ctx.forward`. It passes the ids and the abort controller of the child in one line:

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

## Limit details

The whole tree shares one budget. A child that calls `ctx.chat({ subagents })` passes the budget on, so a child cannot reset it.

- Set `limits` on the first `chat()`. A nested chat in a child uses that budget, so its own `limits` do not apply.
- A child that a router picks does not count against the limits. The children it starts do count, one level deeper.

A refused start reaches the model as a tool error:

| Cause | Tool error |
| --- | --- |
| Too many calls | `subagent limit reached (maxCalls 12)` |
| A child runs past `timeoutMs` | `subagent timed out after 120000 ms` |
| The parent has no time left | `subagent limit reached (no time left)` |
| `timeoutMs: 0` | `subagent limit reached (timeoutMs 0)` |

## Keys for agents

An agent that calls a model needs a provider key. An adapter such as `openaiText` reads its env var, for example `OPENAI_API_KEY`.

To use the key of the user, pass it on `subagents.keys`. The agent then builds its adapter with `ctx.keys`. See [Keys inside agents](../advanced/byok#keys-inside-agents).

## Middleware

A child is its own `chat()` call. Put the middleware of the child in that call. The middleware list of the parent does not reach the child.

The middleware context of a child has these fields:

- `subagentRunId`: tells a child run from a top-level run. Use it to link a child trace to its card.
- `subagentName`: the name of the agent, when the child calls `ctx.chat`.
- `parentSubagentRunId`: for a nested child, the id of the child that started it.

On a routed turn where a child runs and main does not, the middleware of the parent does not run. Only `withPersistence` records that turn. A turn where main runs, including a handoff, runs the middleware of the parent as usual.

## Run a child from code

A server job can run an agent with no parent chat turn. If the job must read a pause or the token counts, pass a sink.

```ts
import {
  chat,
  createSubagentId,
  createSubagentSink,
  defineAgent,
  runAgentStream,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const researcher = defineAgent({
  name: 'researcher',
  description: 'Looks up facts and sources',
  run: (ctx) =>
    chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: ctx.messages,
      ...ctx.forward,
    }),
})

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
- `sink.usage` has one entry for each model call.

After the loop, read `sink.interrupts` to show the pause.

Some things that `chat({ subagents })` does for you, `runAgentStream` does not do:

- It does not check `input`. If the agent has an `inputSchema`, check the input before the call.
- A failure ends as `SUBAGENT_ERROR`. The stream omits `RUN_STARTED`, `MESSAGES_SNAPSHOT`, and `RUN_FINISHED`.

## Sandbox

`withSandbox` keys the workspace by `threadId`. Set `subagents.sandbox` so the child gets the right thread id. Pass `ctx.threadId` into the child `chat()`.

- `'own'` (default): the child thread id is `${parentThreadId}:${name}`. The child gets its own workspace. Parallel children each get a workspace.
- `'inherit'`: the child thread id is the parent thread id. The child uses the parent workspace again when `lifecycle.reuse` is `'thread'`.

If `sandbox` is `'inherit'` and the router returns two or more names, `chat()` throws before the start. Otherwise two children write the same files at the same time.

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

- `ownStream` runs the child with `threadId` `parent-thread:coder`.
- `inheritStream` runs the child with `threadId` `parent-thread`, so `reuse: 'thread'` shares the parent workspace.

See [Sandboxes](../sandbox/overview) for `withSandbox` and `lifecycle.reuse`.

## Client details

The nested `type: 'subagent'` part and `useChat().subagents[i]` are the same live object. When you call `stop()` on either one, this happens:

- The client sets that child to error.
- The client aborts the current parent run.
- The client ignores later events for that id, and for its nested children.

`part.subagent.messages` holds everything the child did:

- text and reasoning
- tool calls and tool results
- the approval state on the tool calls of the child
- nested children, as their own `subagent` parts

`part.subagent.status` is `'running'`, `'finished'`, `'error'`, or `'suspended'`.

### Type the child parts

Pass the agents that you give to `chat()` to `useChat` too. The hook uses them for types only. It does not call `run`.

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

`part.subagent.name` is `'researcher' | 'writer'`. After you check the name, the `messages` of that child use the tools and the output schema of that agent.

When `run` imports server code, do not import the agent into the browser. Do these steps:

1. Declare the agent once in a shared file, with its `name`, `description`, and tool definitions from `toolDefinition`.
2. On the server, pass `defineAgent({ ...researcher, run })` to `chat()`.
3. On the client, pass the declaration.

### Draw cards with `createChatHook`

If you want the factory to draw the cards, use `createChatHook` from `@tanstack/ai-react/ui`:

- Pass the agents that you give to `chat()` as `options.subagents`. The client reads the `name`, `tools`, `interrupts`, and `outputSchema` of each agent for types. It does not call `run`.
- Register `subagentsComponents` for each agent name. Those components receive `SubagentProps` and `Parts`.
- Render `<Messages />`. The subagent card is a part of the assistant message. `<Subagents />` draws that same card for the live list. Pick one place for the card.

> [!WARNING]
> If a started child has a name with no `subagentsComponents` entry, rendering that card throws.

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

By default, the child messages use the same parts components as the parent. To change that for one card, see [Style one child's parts](#style-one-childs-parts).

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
- It is `undefined` for an agent without `inputSchema`.
- A router input stays on the server, so a child that a router started has no `part.subagent.input`.

### Style one child's parts

The reasoning and tool calls of the researcher use the root widgets by default. To make them look different on the researcher card only, pass widgets to the `Parts` of that card:

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
- The keys and props of `toolsComponents` come from the `tools` of the agent. `part.input` and `part.output` are typed, and a tool name that the agent does not have is a type error.
- A tool call with no entry at any level renders nothing.
- An approval for a child tool arrives as `interrupt` on that tool widget, typed from the tool. The root `interruptsComponents` also accepts the approval tools of the child and the ids in the `interrupts` of the agent.
- An approval for a tool that only a card registers also shows in the root `<Interrupts />` list.

Define these maps outside the component. A new object on each render makes every part in the card render again.

## Devtools

In the AI devtools, the Conversation tab shows each child as a card with its name and status:

- The card holds the steps of the child, drawn the same way as the steps of the parent.
- A new step starts after each tool result.
- The User view on the right shows the text and tool outputs of the child.

When the server events reach the devtools (the `devtools()` plugin from `@tanstack/devtools-vite`), the steps of the child are its real server iterations, with the model, the system prompts, and the token usage. Without the plugin, the steps come from the messages in the browser.

See [Stream Events](./stream-events) for `SUBAGENT_*` and `subagentRunId`.
