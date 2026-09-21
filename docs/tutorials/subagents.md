---
title: Subagents
id: subagents-tutorial
order: 5
description: "Create a TanStack Start blog-writing chat. Two named agents handle research and drafts. Jev on OpenRouter picks who runs. createChatHook draws a nested card."
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

You want a blog-writing chat. Some turns need facts. Some turns need a draft. One main model is a poor fit for every turn.

This tutorial adds two named agents. Jev on OpenRouter picks who runs. `createChatHook` draws a nested card for the child.

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

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter

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

## 6. Define two agents

Create `src/lib/agents.ts`.

`defineAgent` makes a named child. `name` is the id the router returns. `description` is the text Jev reads. `run` is a full `chat()` call. Pass `ctx.threadId` and `ctx.runId` so the child stays on the parent stream.

The parent `chat({ subagents: { agents } })` owns the list. It does not call `run` until a turn picks that name. Exclusive strategy means the chosen child owns the turn. Main does not answer after it.

```typescript ignore
import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

export function createBlogAgents(apiKey: string) {
  const researcher = defineAgent({
    name: 'researcher',
    description: 'Looks up facts, sources, and background for a blog post',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You research for a blog desk. Reply with short notes and sources. Do not write the full post.',
        ],
      }),
  })

  const writer = defineAgent({
    name: 'writer',
    description: 'Drafts or rewrites a blog post',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You write blog posts. Use a clear title, short sections, and a closing line.',
        ],
      }),
  })

  return [researcher, writer] as const
}
```

## 7. Add the server route

Create `src/routes/api.chat.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/chat` path.

`getByokKey` reads the `x-byok-openrouter` header, then `OPENROUTER_API_KEY` in the environment. If both are empty, `byokMissing` returns HTTP 401.

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

Pass the agents into `chat({ subagents })`. `strategy: 'exclusive'` means the chosen child owns the turn.

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
      strategy: 'exclusive',
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

With no router, the main model gets one synthetic server tool per agent. The next steps replace that with Jev.

## 8. How routing works

A router is a function. The library calls it before the main model. It can return:

- `'main'`: the parent `chat()` runs as usual
- `'researcher'` or `'writer'`: that child's `run` starts
- an array of names: those children start together

Jev is `decide()` plus `choice()`. Options must include `main` plus every agent name. Jev reads the last message and returns one of those keys.

`createOpenRouterDecider('~typesafe/jev-latest', apiKey)` uses the same OpenRouter key as chat.

## 9. Add Jev as the router

Replace the `subagents` bag. Pass `messages.at(-1)` as `state`. Return `result.target.value`.

```typescript ignore
subagents: {
  agents,
  strategy: 'exclusive',
  router: async ({ messages }) => {
    const result = await decide({
      adapter: createOpenRouterDecider('~typesafe/jev-latest', apiKey),
      state: messages.at(-1),
      questions: {
        target: choice({
          instructions:
            'Who must handle this turn for a blog-writing desk?',
          options: {
            main: 'General chat, greetings, or a mixed question',
            researcher: agents[0].description,
            writer: agents[1].description,
          } satisfies SubagentChoiceOptions<typeof agents>,
        }),
      },
    })
    return result.target.value
  },
},
```

If the user asks for sources, Jev returns `researcher`. If the user asks for a post, Jev returns `writer`. If the user says hello, Jev returns `main`.

Add these imports:

```typescript
import {
  chat,
  chatParamsFromRequest,
  choice,
  decide,
  toServerSentEventsResponse,
  type SubagentChoiceOptions,
} from '@tanstack/ai'
import {
  createOpenRouterDecider,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
```

## 10. Abort the run from the client

The browser abort signal fires when the user clicks Stop. The server must pass that into `chat()`. Then a hanging child stops, and `SUBAGENT_ERROR` can emit.

Add an `AbortController`. Link it to `request.signal`. Pass it to `chat()` and to `toServerSentEventsResponse`.

```typescript ignore
const abortController = new AbortController()
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
  choice,
  decide,
  toServerSentEventsResponse,
  type SubagentChoiceOptions,
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
    abortController,
    subagents: {
      agents,
      strategy: 'exclusive',
      router: async ({ messages }) => {
        const result = await decide({
          adapter: createOpenRouterDecider('~typesafe/jev-latest', apiKey),
          state: messages.at(-1),
          questions: {
            target: choice({
              instructions:
                'Who must handle this turn for a blog-writing desk?',
              options: {
                main: 'General chat, greetings, or a mixed question',
                researcher: agents[0].description,
                writer: agents[1].description,
              } satisfies SubagentChoiceOptions<typeof agents>,
            }),
          },
        })
        return result.target.value
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

Create `src/chat-ui.tsx`. Register `layout`, `message`, and `input` first. `layout` receives `Messages` and `Input` as components. `useChatContext()` reads the live chat.

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
}

export const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    layout: function Layout({ Messages, Input }) {
      const chat = useChatContext()
      return (
        <div className="flex h-screen flex-col bg-gray-900">
          <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
            <OpenRouterKeyForm />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <Messages />
          </div>
          {chat.error ? <p>{chat.error.message}</p> : null}
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
            void chat.sendMessage(text)
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
    fallback: () => null,
  },
})
```

`Parts` walks one message and picks a component per part. The next steps add those components.

## 12. Pass in the text part

Add `partsComponents.text`. The factory now draws assistant text.

```tsx ignore
partsComponents: {
  text: ({ part }) => (
    <div className="whitespace-pre-wrap text-white">{part.content}</div>
  ),
  fallback: () => null,
},
```

A `type: 'subagent'` part still hits `fallback` until you slot a component.

## 13. Create the subagent card

Create `src/components/subagent-card.tsx`. The card reads `part.subagent`. That object is the same handle as `useChat().subagents[i]`. `stop()` aborts the current parent run.

```tsx ignore
import type { UIMessage } from '@tanstack/ai-react'

type SubagentPart = Extract<UIMessage['parts'][number], { type: 'subagent' }>

export function SubagentCard({ part }: { part: SubagentPart }) {
  const subagent = part.subagent

  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm text-orange-300">{subagent.name}</strong>
        <span className="text-xs text-gray-400">{subagent.status}</span>
        {subagent.status === 'running' ? (
          <button
            type="button"
            onClick={() => subagent.stop?.()}
            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : null}
      </header>
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      {subagent.messages.map((message) => (
        <div key={message.id} className="mt-2">
          {message.parts.map((childPart, index) =>
            childPart.type === 'text' && childPart.content ? (
              <div
                key={`text-${index}`}
                className="whitespace-pre-wrap text-white"
              >
                {childPart.content}
              </div>
            ) : null,
          )}
        </div>
      ))}
    </section>
  )
}
```

## 14. Slot the card into subagent parts

Set `partsComponents.subagent` to `SubagentCard`. `Parts` now renders that card for every `type: 'subagent'` part.

The finished factory is `src/chat-ui.tsx`:

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { SubagentCard } from '@/components/subagent-card'
import { byok } from '@/lib/byok'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
}

export const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    layout: function Layout({ Messages, Input }) {
      const chat = useChatContext()
      return (
        <div className="flex h-screen flex-col bg-gray-900">
          <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
            <OpenRouterKeyForm />
          </div>
          {chat.messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto px-4 py-8">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  Blog desk
                </h2>
                <p className="text-sm text-gray-400">
                  Paste an OpenRouter key. Ask for research or a draft. Jev
                  picks the agent.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <Messages />
            </div>
          )}
          {chat.subagents.length > 0 ? (
            <aside className="border-t border-orange-500/10 px-4 py-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Subagents
              </h2>
              {chat.subagents.map((subagent) => (
                <p
                  key={subagent.id}
                  className="mb-1 flex items-center gap-2 text-sm text-gray-200"
                >
                  <span>
                    {subagent.name}: {subagent.status}
                  </span>
                  {subagent.status === 'running' ? (
                    <button
                      type="button"
                      onClick={() => subagent.stop?.()}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Stop
                    </button>
                  ) : null}
                </p>
              ))}
            </aside>
          ) : null}
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
          <Input />
        </div>
      )
    },
    message: function Message({ message, Parts }) {
      return (
        <article
          data-role={message.role}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <Parts />
        </article>
      )
    },
    input: function Input() {
      const chat = useChatContext()
      return (
        <form
          className="border-t border-orange-500/10 bg-gray-900/80 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            const field = event.currentTarget.elements.namedItem('message')
            if (!(field instanceof HTMLTextAreaElement)) return
            const text = field.value.trim()
            if (!text) return
            field.value = ''
            void chat.sendMessage(text)
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              name="message"
              rows={1}
              disabled={chat.isLoading}
              placeholder="Ask for research, or ask for a draft..."
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
      )
    },
  },
  partsComponents: {
    text: ({ part }) => (
      <div className="whitespace-pre-wrap text-white">{part.content}</div>
    ),
    subagent: SubagentCard,
    fallback: () => null,
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

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/subagents`.

<!-- ::client-example library=ai framework=react slug=subagents -->

You have a blog desk. Jev picks the specialist. The nested card shows the child as it streams.

The full example is on GitHub: [TanStack/ai `examples/react/subagents`](https://github.com/TanStack/ai/tree/main/examples/react/subagents).

For the API, open [Subagents](../chat/subagents).
