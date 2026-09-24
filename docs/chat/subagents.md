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

**Without a router.** The library adds one synthetic server tool per agent. The main model calls that tool. The public stream still emits `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` (or `SUBAGENT_ERROR`) and nested parts. The UI does not treat spawn as a normal tool card. The child's events stream while the tool runs, and the child's text becomes the tool result. The child reads the conversation as it is at that tool call.

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

The resume uses the plan that the router picked in the first run. It does not call the router again. While the child waits, its card has `status: 'suspended'` and `interruptIds`. After you approve, the card shows the tool result and the child's reply. Client tools in a child work the same way.

The same flow works without a router. The child's tool call stays open until the resume, then the parent model reads the child's result.

## Middleware

A child is its own `chat()` call. Put the child's middleware in that call. The parent's middleware list does not reach the child.

Inside a child, the middleware context has `subagentRunId`. Use it to tell a child run from a top-level run, and to link a child trace to its card.

On a routed turn where a child runs and main does not, the parent's middleware does not run. Only `withPersistence` records that turn. A turn where main runs, including a handoff, runs the parent's middleware as usual.

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
