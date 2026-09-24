---
title: Subagents
id: subagents-tutorial
order: 5
description: "Create a TanStack Start blog-writing chat. Three named agents handle research, drafts, and SEO. Jev on OpenRouter picks who runs, and can start research and SEO together. createChatHook draws a nested card."
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

You want a blog-writing chat. Some turns need facts. Some turns need a draft. Some turns need SEO titles. One main model is a poor fit for every turn.

This tutorial adds three named agents. Jev on OpenRouter picks who runs. Research and SEO can start together. `createChatHook` draws a nested card for each child.

This tutorial is React + Start. For the API, open [Subagents](../chat/subagents).

You can skip the scaffold and paste a key in the sandbox at the end of this page.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

## 2. Install packages

You need the core SDK, the React UI factory, and OpenRouter for chat and for Jev.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter @tanstack/react-devtools @tanstack/react-ai-devtools

<!-- ::end:tabs -->

## 3. Client and server

A chat has two sides.

The **client** runs in the browser. It holds the OpenRouter key, draws messages, and POSTs to your route.

The **server** route reads that key, asks Jev who must run, and streams tokens back.

The next steps build the client pieces. Then they add the agents and the route.

## 4. Set up BYOK on the client

Create `src/lib/byok.ts`. `memoryStorage()` keeps the OpenRouter key in this tab.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai). Chat and Jev both use this key.

## 5. Add the key form

Create `src/components/open-router-key-form.tsx`. Export `OpenRouterKeyForm` from that file. `byok.update` saves the key. `useByok` reads the status.

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

If you want passkeys, open [Bring Your Own Key](../advanced/byok).

## 6. Define three agents

Create `src/lib/blog-agents.ts`. It declares each agent once: `name` is the id the router returns, and `description` is the text Jev reads. The file holds no server code, so the browser can import it too.

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

Create `src/lib/agents.ts`. `defineAgent` spreads each declaration and adds `run`, a full `chat()` call. Pass `ctx.threadId`, `ctx.runId`, `ctx.parentRunId`, `ctx.subagentRunId`, and `ctx.resume` into that call.

The parent `chat({ subagents: { agents } })` owns the list. It does not call `run` until a turn picks that name.

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

## 7. Add the server route

Create `src/routes/api.chat.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/chat` path.

The page sends the key in the `x-byok-openrouter` header. `getByokKey` reads that header. If the header is empty, `byokMissing` returns HTTP 401.

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

Pass the agents into `chat({ subagents })`. This first route has no router. The main model gets one synthetic tool per agent.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createBlogAgents } from '@/lib/agents'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  const agents = createBlogAgents(apiKey)
  const stream = chat({
    adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    subagents: {
      agents,
    },
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

The next steps replace that tool list with Jev. `strategy: 'exclusive'` belongs with the router. It means the chosen child owns the turn.

## 8. How routing works

A router is a function. The library calls it before the main model. It can return:

- `'main'`: the parent `chat()` runs as usual
- one agent name, such as `'researcher'`, `'writer'`, or `'seo'`: that child's `run` starts
- an array of names: those children use `subagents.order`
- `{ names, order }`: this turn overrides `subagents.order`
- `{ steps }`: one group runs, then the next group. The next group reads the earlier text

`order: 'parallel'` starts the names together. No agent reads another agent text. `order: 'sequence'` runs them one after another. Each later child reads the earlier child text. Omit `order` to get `parallel`.

Pass the router's `agents` argument to `subagentRoute`. Each yes/no question uses that agent's `description`. You can pass `when` to replace those questions. `when` must include every agent name. `then: ['writer']` runs the writer after the other selected agents. Those other agents start together. The writer reads their text. `pick` returns `main`, one name, `{ names, order }`, or `{ steps }`. Names follow that `agents` array.

`createOpenRouterDecider('~typesafe/jev-latest', apiKey)` uses the same OpenRouter key as chat.

## 9. Add Jev as the router

Replace the `subagents` bag. Pass `then: ['writer']`. `strategy: 'exclusive'` means the chosen child owns the turn. Main does not answer after it.

If `messages` is empty, return `'main'`. Otherwise pass the last message as `state`. Pass `abortSignal` so Stop cancels Jev. `subagentRoute` asks Jev which agents run. When the writer is one of them, the other agents start together, and the writer runs after them.

```typescript ignore
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
```

If the user asks for sources, Jev returns `researcher`. If the user asks for a post, Jev returns `writer`. If the user says hello, Jev returns `main`.

If the user asks for research and SEO, Jev returns `{ names: ['researcher', 'seo'], order: 'parallel' }`. The two cards start together.

If the user asks for research, SEO, and an article, Jev returns `{ steps }`. Research and SEO start together. The writer starts after both finish and reads both texts.

If the user asks for research and an article, with no SEO, the researcher runs first. The writer then reads those notes.

Add these imports:

```typescript
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
```

## 10. Abort the run from the client

The browser abort signal fires when the user clicks Stop. The server must pass that into `chat()`. Each agent links `ctx.abortSignal` to its own `chat({ abortController })`. Stop then cancels the OpenRouter request, and `SUBAGENT_ERROR` can emit.

Add an `AbortController`. Link it to `request.signal`. If the request is already aborted, abort the controller at once, because the listener then never fires. Pass it to `chat()` and to `toServerSentEventsResponse`.

```typescript ignore
const abortController = new AbortController()
if (request.signal.aborted) abortController.abort()
request.signal.addEventListener(
  'abort',
  () => {
    abortController.abort()
  },
  { once: true },
)
```

Then pass `abortController` into `chat({ abortController })` and `toServerSentEventsResponse(stream, { abortController })`.

The finished route is `src/routes/api.chat.ts`:

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

## 11. Create the chat UI factory

The public factory is `createChatHook` from `@tanstack/ai-react/ui`. It calls `createChatUI` and binds `useChat`.

Create `src/chat-ui.tsx`. Register `layout`, `message`, and `input`. The layout props type is `LayoutProps`. Render `Messages` and `Input`. The subagent card is a part of the assistant message. `input` calls `useChatContext()` to send.

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook, type LayoutProps } from '@tanstack/ai-react/ui'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
}

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
        <article data-role={message.role}>
          <Parts />
        </article>
      )
    },
    input: function Input() {
      const chat = useChatContext()
      return (
        <form
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
          <textarea name="message" disabled={chat.isLoading} />
          <button type="submit" disabled={chat.isLoading}>
            Send
          </button>
        </form>
      )
    },
  },
  partsComponents: {
    fallback: ({ part }) => (
      <p className="text-xs text-gray-400">{part.type}</p>
    ),
  },
})
```

`Parts` walks one message and picks a component per part. The next steps add those components.

## 12. Pass in the text part

Add `partsComponents.text`. The factory now draws assistant text.

```tsx ignore
import { TextPart } from '@tanstack/ai-react/ui'

partsComponents: {
  text: ({ part }) => (
    <TextPart className="chat-markdown" content={part.content} />
  ),
  fallback: ({ part }) => (
    <p className="text-xs text-gray-400">{part.type}</p>
  ),
},
```

`TextPart` renders Markdown. Research notes and the article both use it. A `type: 'subagent'` part still needs a named component. The next step adds those.

## 13. Create the subagent components

Create `src/components/subagent-card.tsx`. Each agent name gets a component. The props type is `SubagentProps`. It gives you `subagent` and `Parts`.

The researcher card keeps the notes in a closed `<details>` section. The writer card is an article. `<Parts />` renders `subagent.messages`. `stop()` aborts the current parent run.

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

## 14. Register every named subagent

Put `blogAgents` on `options.subagents`. The factory reads each agent name from that list. Then pass `subagentsComponents` with one component per name. TypeScript requires every name. The factory throws if a spawned name is missing.

Create `src/components/chat-input.tsx`. The form calls `useChatContext()` to send. It has no return type.

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

The finished factory is `src/chat-ui.tsx`:

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

Create `src/routes/index.tsx`. Call `useAppChat()` and render `<chat.AppChat />`.

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

## 15. Try it

1. Run the app.
2. Paste an OpenRouter key.
3. Send `What are three facts about durable streams?` The researcher card opens.
4. Send `Write a short blog post about durable streams.` The writer card opens.
5. Send `do research and seo`. The researcher card and the SEO card open together.
6. Send `research octopuses and squids, suggest SEO, and write the article`. Research and SEO open together. The writer card opens after both finish.
7. After the research and SEO cards finish, send `write an article with that info`. The writer uses the notes from those cards.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/subagents`.

<!-- ::client-example library=ai framework=react slug=subagents -->

You have a blog desk. Jev picks the specialist. The nested card shows the child as it streams.

A refresh drops these cards. Keep them in [Persisted subagents](./subagents-persisted).

The full example is on GitHub: [TanStack/ai `examples/react/subagents`](https://github.com/TanStack/ai/tree/main/examples/react/subagents).

For the API, open [Subagents](../chat/subagents).
