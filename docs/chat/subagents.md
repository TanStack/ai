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

You want a specialist to handle some turns (research, writing, a sandbox harness) while the parent chat stays one conversation. `chat({ subagents })` starts that child, tags its events with `subagentRunId`, and the client stores the work in a `type: 'subagent'` part.

Want a Start app with two agents and Jev? Open the [Subagents tutorial](../tutorials/subagents).

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
    }),
})
```

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

**Without a router.** The library adds one synthetic server tool per agent. The main model calls that tool. The public stream still emits `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` (or `SUBAGENT_ERROR`) and nested parts. The UI does not treat spawn as a normal tool card.

## Strategy

- `exclusive` (default): the chosen child owns the turn. Main does not answer after it.
- `handoff`: the child streams first. Then main runs with the new child text in the messages.

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

The nested `type: 'subagent'` part and `useChat().subagents[i]` are the same live object. Call `stop()` on either one. The client sets that child to error and aborts the current parent run. Later events for that id are ignored.

Use `createChatHook` from `@tanstack/ai-react/ui` when you want the factory to draw the cards. Pass `options.subagents` as an object. Each key is an agent name. Register `subagentsComponents` for each key. Those components receive `SubagentProps` and `Parts`. Render `<Messages />`. The subagent card is a part of the assistant message. `<Subagents />` draws that same card for the live list. Pick one place for the card. The factory throws if a name is missing.

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
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import type { LayoutProps, SubagentProps } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  subagents: {
    researcher: { description: 'Looks up facts' },
    writer: { description: 'Drafts posts' },
  },
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

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages, Input }: LayoutProps<typeof chatOptions>) => (
      <main>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
    input: () => null,
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

See [Stream Events](./stream-events) for `SUBAGENT_*` and `subagentRunId`.
