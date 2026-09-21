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

The router can return `'main'`, one agent name, or an array of names. An array starts those children together.

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

Use `createChatHook` from `@tanstack/ai-react/ui`. Slot a card into `partsComponents.subagent`. Render nested child parts with `<SubagentMessages />`. Render the live list with `<Subagents />`. Do not map `subagent.messages` or `chat.subagents` yourself.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages, Subagents, Input }) => (
      <main>
        <Messages />
        <Subagents />
        <Input />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
    input: () => null,
    subagent: ({ subagent, SubagentMessages }) => (
      <section>
        <strong>{subagent.name}</strong>
        <span>{subagent.status}</span>
        {subagent.status === 'running' ? (
          <button type="button" onClick={() => subagent.stop?.()}>
            Stop
          </button>
        ) : null}
        <SubagentMessages />
      </section>
    ),
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    subagent: ({ part, SubagentMessages }) => (
      <section>
        <strong>{part.subagent.name}</strong>
        <SubagentMessages />
      </section>
    ),
    fallback: () => null,
  },
})

export function ChatScreen() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

`part.subagent` is the same object as `useChat().subagents[i]` for that id. `stop()` on either one aborts the current parent run.

See [Stream Events](./stream-events) for `SUBAGENT_*` and `subagentRunId`.
