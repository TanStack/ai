---
title: Subagents
id: subagents-tutorial
order: 5
description: "Build a blog-writing chat in TanStack Start with three named agents for research, drafts, and SEO. Jev on OpenRouter picks who runs, and createChatHook draws a card for each agent."
keywords:
  - tanstack ai
  - tutorial
  - subagents
  - defineAgent
  - jev
  - openrouter
  - createChatHook
  - tanstack start
---

You want a blog-writing chat. Some turns need facts, some need a draft, and some need SEO titles. One model with one system prompt is a poor fit for all of them.

Give each job its own named agent, and let a router pick who runs on each turn. In this tutorial, Jev on OpenRouter is the router. Research and SEO can run at the same time, and the page shows a card for each agent while it streams. It takes about 30 minutes.

This tutorial uses React and TanStack Start. For the API, open [Subagents](../chat/subagents). To skip the setup, paste a key in the sandbox in step 8.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the packages. OpenRouter serves both the chat models and Jev.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter @tanstack/react-devtools @tanstack/react-ai-devtools

<!-- ::end:tabs -->

The two devtools packages are for the [Devtools](../getting-started/devtools) panel. The steps below do not need them.

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai). The chat and Jev both use this key.

## 2. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. `byok.update` saves the key, and `byok.clear` removes it. `useByok` reads the status.

```tsx ignore
import { useState } from 'react'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/lib/byok'

export function OpenRouterKeyForm() {
  const snapshot = useByok(byok)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[openrouterByok.id]
  const masked = status && 'masked' in status ? status.masked : undefined
  const missingKey = snapshot.prompt?.reason === 'missing'

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        setError('')
        void byok
          .update(openrouterByok.id, next)
          .then(() => setDraft(''))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            ),
          )
      }}
    >
      <label className="sr-only" htmlFor="openrouter-key">
        OpenRouter API key
      </label>
      <input
        id="openrouter-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={masked ? `Saved ${masked}` : 'Paste your OpenRouter key'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save key
        </button>
        {masked ? (
          <button
            type="button"
            className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200"
            onClick={() => {
              setError('')
              void byok
                .clear(openrouterByok.id)
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not clear key',
                  ),
                )
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {missingKey ? (
        <p className="text-xs text-amber-400">
          Paste an OpenRouter key, then send again.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
```

For passkeys or other storage, open [Bring Your Own Key](../advanced/byok).

## 3. Define three agents

Create `src/lib/blog-agents.ts`. It declares each agent once:

- `name` is the id that the router returns.
- `description` is the yes/no question that Jev answers for this agent.

This file holds no server code, so the browser can import it too.

```typescript ignore
// Shared by the server and the browser, so it holds no server code. The
// server adds `run` in `agents.ts`. The browser passes the list to the chat
// UI factory for types.
export const researcher = {
  name: 'researcher',
  description:
    'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft or for SEO. Answer no when they do not ask to look anything up.',
} as const

export const writer = {
  name: 'writer',
  description:
    'Does this turn need a written article, post, or rewrite? Answer yes only when the user asks for an article, post, draft, or rewrite. Answer no when they ask for research or SEO and do not ask for an article.',
} as const

export const seo = {
  name: 'seo',
  description:
    'Does this turn need SEO work? Answer yes when the user asks for SEO, search titles, a meta description, or tags. Answer no when they do not mention SEO, titles, a meta description, or tags.',
} as const

export const blogAgents = [researcher, writer, seo] as const
```

Create `src/lib/agents.ts`. `defineAgent` spreads each declaration and adds `run`, which is a full `chat()` call. Pass these `ctx` fields into each call: `threadId`, `runId`, `parentRunId`, `subagentRunId`, and `resume`.

```typescript ignore
import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { researcher, seo, writer } from '@/lib/blog-agents'

function linkAbort(signal: AbortSignal | undefined) {
  const abortController = new AbortController()
  if (signal === undefined) return abortController
  if (signal.aborted) {
    abortController.abort()
    return abortController
  }
  signal.addEventListener(
    'abort',
    () => {
      abortController.abort()
    },
    { once: true },
  )
  return abortController
}

export function createBlogAgents(apiKey: string) {
  const researcherAgent = defineAgent({
    ...researcher,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You research for a blog desk. Reply in Markdown with short notes and sources. Use a list. Do not write the full post.',
        ],
      }),
  })

  const writerAgent = defineAgent({
    ...writer,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You write blog posts in Markdown. Start with one # title. Use short ## sections and a closing line. When earlier messages contain research notes or SEO text, write only from those messages. Do not add facts that are not in those messages.',
        ],
      }),
  })

  const seoAgent = defineAgent({
    ...seo,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You prepare SEO for a blog post. Reply in Markdown. Give 5 title options, one meta description under 160 characters, and a short tag list. Do not write the full article.',
        ],
      }),
  })

  return [researcherAgent, writerAgent, seoAgent] as const
}
```

`linkAbort` connects the abort signal of the parent run to each child `chat()`. When the user clicks Stop, the child request to OpenRouter stops too.

## 4. Add the server route

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps this file name to the `/api/chat` path.

The route does three jobs:

1. It reads the OpenRouter key and creates the agents.
2. It links an `AbortController` to `request.signal`, so Stop cancels the run.
3. It asks Jev which agents run on this turn.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  decide,
  subagentRoute,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  createOpenRouterDecider,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createBlogAgents } from '@/lib/agents'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  const abortController = new AbortController()
  if (request.signal.aborted) abortController.abort()
  request.signal.addEventListener(
    'abort',
    () => {
      abortController.abort()
    },
    { once: true },
  )

  const agents = createBlogAgents(apiKey)
  const stream = chat({
    adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    abortController,
    subagents: {
      agents,
      strategy: 'exclusive',
      router: async ({ messages, agents, abortSignal }) => {
        const state = messages.at(-1)
        if (state === undefined) return 'main'
        const route = subagentRoute(agents, { then: ['writer'] })
        const result = await decide({
          adapter: createOpenRouterDecider('~typesafe/jev-latest', apiKey),
          state,
          questions: route.questions,
          abortSignal,
        })
        return route.pick(result)
      },
    },
  })
  return toServerSentEventsResponse(stream, { abortController })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the main entry of the adapter.

## 5. Create the agent cards

Each agent gets its own card component. Create `src/components/subagent-card.tsx`.

- The props type is `SubagentProps`. It gives you `subagent` and `Parts`.
- `<Parts />` renders the messages of that agent.
- `subagent.stop()` aborts the current parent run.

```tsx ignore
import type { SubagentProps } from '@tanstack/ai-react/ui'
import type { BlogChatOptions } from '@/chat-ui'

function AgentHeader({
  name,
  status,
  onStop,
}: {
  name: string
  status: string
  onStop?: () => void
}) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <strong className="text-sm uppercase tracking-wide">{name}</strong>
      <span className="text-xs opacity-70">{status}</span>
      {status === 'running' && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Stop
        </button>
      ) : null}
    </header>
  )
}

export function Researcher({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'researcher'>) {
  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3 text-gray-100">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs opacity-70">
          Research notes
        </summary>
        <div className="mt-2">
          <Parts />
        </div>
      </details>
    </section>
  )
}

export function Seo({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'seo'>) {
  return (
    <section className="mt-3 rounded-lg border border-sky-500/40 bg-gray-900/80 p-3 text-gray-100">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <div className="mt-2">
        <Parts />
      </div>
    </section>
  )
}

export function Writer({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'writer'>) {
  return (
    <article className="writer-article">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-sm text-red-700">{subagent.error.message}</p>
      ) : null}
      <Parts />
    </article>
  )
}
```

The researcher card keeps the notes in a closed `<details>` section. The writer card is an article.

## 6. Create the input

Create `src/components/chat-input.tsx`. The form calls `useChatContext()` to send, show errors, and stop.

```tsx ignore
import { useChatContext } from '@/chat-ui'

export function ChatInput() {
  const chat = useChatContext()
  return (
    <>
      {chat.error ? (
        <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {chat.error.message}
        </div>
      ) : null}
      {chat.isLoading ? (
        <div className="mb-3 flex items-center justify-center">
          <button
            type="button"
            onClick={chat.stop}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        </div>
      ) : null}
      <form
        className="border-t border-orange-500/10 bg-gray-900/80 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          const field = event.currentTarget.elements.namedItem('message')
          if (!(field instanceof HTMLTextAreaElement)) return
          const text = field.value.trim()
          if (!text) return
          field.value = ''
          void chat.sendMessage(text).catch(() => undefined)
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            name="message"
            rows={1}
            disabled={chat.isLoading}
            placeholder="Ask for research, a draft, or SEO titles..."
            onKeyDown={(event) => {
              // Enter also confirms an IME composition. Do not send then.
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return
              }
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
            className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          <button
            type="submit"
            disabled={chat.isLoading}
            className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </>
  )
}
```

## 7. Create the chat UI

Create `src/chat-ui.tsx`. `createChatHook` from `@tanstack/ai-react/ui` builds the chat UI from your components:

- `components` holds the `layout`, the `message`, and the `input`.
- `partsComponents` draws each part of a message. `TextPart` renders Markdown.
- `subagentsComponents` maps each agent name to its card.

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-react'
import {
  createChatHook,
  TextPart,
  type LayoutProps,
} from '@tanstack/ai-react/ui'
import { ChatInput } from '@/components/chat-input'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { Researcher, Seo, Writer } from '@/components/subagent-card'
import { blogAgents } from '@/lib/blog-agents'
import { byok } from '@/lib/byok'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
  subagents: blogAgents,
}

export type BlogChatOptions = typeof chatOptions

export const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    layout: function Layout({
      Messages,
      Input,
    }: LayoutProps<typeof chatOptions>) {
      return (
        <div className="flex h-screen flex-col bg-gray-900">
          <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
            <h1 className="mb-2 text-sm font-semibold text-white">Blog desk</h1>
            <OpenRouterKeyForm />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <Messages />
          </div>
          <Input />
        </div>
      )
    },
    message: function Message({ message, Parts }) {
      return (
        <article
          data-role={message.role}
          className={`mb-2 rounded-lg p-4 text-gray-100 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <Parts />
        </article>
      )
    },
    input: ChatInput,
  },
  partsComponents: {
    text: ({ part }) => (
      <TextPart className="chat-markdown" content={part.content} />
    ),
    fallback: ({ part }) => (
      <p className="text-xs text-gray-400">{part.type}</p>
    ),
  },
  subagentsComponents: {
    researcher: Researcher,
    writer: Writer,
    seo: Seo,
  },
})
```

Replace `src/routes/index.tsx` with this page. Call `useAppChat()` and render `<chat.AppChat />`.

```tsx ignore
import { createFileRoute } from '@tanstack/react-router'
import { useAppChat } from '@/chat-ui'

function ChatPage() {
  const chat = useAppChat()
  return <chat.AppChat />
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
```

## 8. Try it

1. Run the app and paste an OpenRouter key.
2. Send `What are three facts about durable streams?` The researcher card opens.
3. Send `Write a short blog post about durable streams.` The writer card opens.
4. Send `do research and seo`. The researcher card and the SEO card open together.
5. Send `research octopuses and squids, suggest SEO, and write the article`. Research and SEO open together. The writer card opens after both finish.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/subagents`.

<!-- ::client-example library=ai framework=react slug=subagents -->

You have a blog desk. Jev picks the specialist, and a card shows each agent as it streams.

A refresh drops these cards. To keep them, continue with [Persisted subagents](./subagents-persisted).

## How it works

On each turn, the server runs the router before the main model:

1. The router passes the last message to Jev as `state`.
2. `subagentRoute` turns each agent `description` into one yes/no question for Jev.
3. `route.pick(result)` turns the answers into the agents that run.
4. With `strategy: 'exclusive'`, the chosen agents own the turn. The main model does not answer after them.

Some turns and what Jev picks:

- **"Hello"**: `main`. The parent `chat()` answers as usual.
- **A request for sources**: `researcher`.
- **A request for a post**: `writer`.
- **Research and SEO**: `{ names: ['researcher', 'seo'], order: 'parallel' }`. The two cards start together.
- **Research, SEO, and an article**: `{ steps }`. Research and SEO start together. The writer starts after both finish and reads both texts.

If the user asks for research and an article, with no SEO, the researcher runs first. Then the writer reads those notes.

The cards stay in the thread. After the research and SEO cards finish, send `write an article with that info`. The writer uses the notes from those cards.

On the client, each agent run is a `type: 'subagent'` part of the assistant message. The chat UI draws that part with the card you registered for the agent name.

The full example is on GitHub: [TanStack/ai `examples/react/subagents`](https://github.com/TanStack/ai/tree/main/examples/react/subagents).

## Advanced

### What a router can return

A router is a function. The library calls it before the main model. It can return:

- `'main'`: the parent `chat()` runs as usual.
- One agent name, such as `'researcher'`: the `run` of that agent starts.
- An array of names: those agents run in the order from `subagents.order`.
- `{ names, order }`: this turn overrides `subagents.order`.
- `{ steps }`: one group runs, then the next group. The next group reads the earlier text.

The two orders:

- `order: 'parallel'` starts the agents together. No agent reads the text of another agent. If you omit `order`, you get `parallel`.
- `order: 'sequence'` runs the agents one after another. Each later agent reads the text of the earlier agents.

### `subagentRoute` options

`subagentRoute(agents, options)` builds the `decide()` questions and the `pick` function:

- Pass the `agents` argument of the router. Each yes/no question uses the `description` of that agent.
- `when` replaces those questions. It must include every agent name.
- `then: ['writer']` runs the writer after the other selected agents. Those other agents start together, and the writer reads their text.
- `pick` returns `main`, one name, `{ names, order }`, or `{ steps }`. Names follow the order of the `agents` array.

`createOpenRouterDecider('~typesafe/jev-latest', apiKey)` uses the same OpenRouter key as the chat.

### Agents without a router

The parent `chat({ subagents: { agents } })` owns the agent list. It does not call `run` until a turn picks that name.

With no `router`, the main model gets one synthetic tool for each agent, and the model decides when to call them:

```typescript ignore
subagents: {
  agents,
},
```

`strategy: 'exclusive'` belongs with a router. It means the chosen agent owns the turn.

### Stop and abort

The browser aborts the request when the user clicks Stop. The route links that to `chat()`:

- If `request.signal` is already aborted, the listener never fires. So the route checks `request.signal.aborted` first and aborts the controller at once.
- The route passes `abortController` to `chat()` and to `toServerSentEventsResponse`.
- The router passes `abortSignal` to `decide()`, so Stop also cancels Jev.
- Each agent links `ctx.abortSignal` to its own `chat({ abortController })`. Stop then cancels the request to OpenRouter, and a `SUBAGENT_ERROR` event can come out of the stream.

### The chat UI factory

- `createChatHook` calls `createChatUI` and binds `useChat`.
- The layout props type is `LayoutProps`. Render `Messages` and `Input` in it.
- `Parts` walks one message and picks a component for each part. `fallback` draws any part type with no component.
- The factory reads each agent name from `options.subagents`. TypeScript requires a `subagentsComponents` entry for every name.
- If the server starts an agent with no registered component, the factory throws.
