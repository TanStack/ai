---
title: Subagents
id: subagents-tutorial
order: 5
description: "Create a TanStack Start blog-writing chat. Two named agents handle research and drafts. Jev picks who runs. The UI shows a nested card."
keywords:
  - tanstack ai
  - tutorial
  - subagents
  - defineAgent
  - jev
  - typesafe
  - useChat
  - tanstack start
---

You want a blog-writing chat. Some turns need facts. Some turns need a draft. One main model is a poor fit for every turn.

This tutorial adds two named agents. Jev picks who runs. The UI shows a nested card for the child.

This tutorial is React + Start. For the API, open [Subagents](../chat/subagents).

You can skip the scaffold and paste a key in the sandbox at the end of this page.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

## 2. Install packages

You need the core SDK, the React hook, OpenRouter for chat, and TypeSafe for Jev.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter @tanstack/ai-typesafe

<!-- ::end:tabs -->

## 3. Client and server

A chat has two sides.

The **client** runs in the browser. It holds the OpenRouter key, draws messages, and POSTs to your route.

The **server** route reads that key, asks Jev who must run, and streams tokens back.

The next steps build the client. Then they add the agents and the route.

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

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

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

## 6. Set the TypeSafe key

Jev runs on the server. Get a key from [TypeSafe](https://typesafe.ai). Then set it in the environment:

```bash
TYPESAFE_API_KEY=your-typesafe-api-key
```

Keep this key on the server. Do not send it to the browser.

In the example app, put it in `.env.local` next to `package.json`.

## 7. Define two agents

Create `src/lib/agents.ts`. Each `run` is a `chat()` call. Pass `ctx.threadId` and `ctx.runId` so the child stays on the stream.

The researcher returns notes. The writer returns a draft.

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

`name` is the id the router returns. `description` is the text Jev reads.

## 8. Add the server route

Create `src/routes/api.chat.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/chat` path.

### Read the OpenRouter key

`getByokKey` reads the `x-byok-openrouter` header, then `OPENROUTER_API_KEY` in the environment. If both are empty, `byokMissing` returns HTTP 401.

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

### Ask Jev who must run

`decide()` asks one `choice` question. Options must include `main` plus every agent name.

### Start `chat({ subagents })`

Pass the agents, `strategy: 'exclusive'`, and the router. Exclusive means the chosen child owns the turn.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  choice,
  decide,
  toServerSentEventsResponse,
  type ModelMessage,
  type SubagentChoiceOptions,
  type UIMessage,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { typesafeDecider } from '@tanstack/ai-typesafe'
import { createBlogAgents } from '@/lib/agents'

const jev = typesafeDecider('jev-latest')

function lastUserText(messages: Array<UIMessage | ModelMessage>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    if ('content' in message && typeof message.content === 'string') {
      return message.content
    }
    if ('parts' in message && Array.isArray(message.parts)) {
      return message.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('content' in part ? part.content : ''))
        .join('')
    }
  }
  return ''
}

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
      sandbox: 'own',
      router: async ({ messages }) => {
        const result = await decide({
          adapter: jev,
          state: { text: lastUserText(messages) },
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
        const pick = result.target.value
        if (pick === 'main' || pick === 'researcher' || pick === 'writer') {
          return pick
        }
        return 'main'
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

If the user asks for sources, Jev returns `researcher`. If the user asks for a post, Jev returns `writer`. If the user says hello, Jev returns `main`.

## 9. Draw nested cards

Open `src/routes/index.tsx`. Import `OpenRouterKeyForm` from `@/components/open-router-key-form`. Pass `byok` to `useChat`.

Walk `message.parts`. A `type: 'subagent'` part is a child card. `part.subagent` and `useChat().subagents[i]` are the same object. Call `stop()` on either one.

This is `src/routes/index.tsx`:

```tsx ignore
import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useChat,
  type UIMessage,
} from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

type SubagentHandle = Extract<
  UIMessage['parts'][number],
  { type: 'subagent' }
>['subagent']

function MessageBody({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === 'text' && part.content) {
          return (
            <div
              key={`text-${index}`}
              className="whitespace-pre-wrap text-white"
            >
              {part.content}
            </div>
          )
        }
        if (part.type === 'subagent') {
          return <SubagentCard key={part.subagent.id} subagent={part.subagent} />
        }
        return null
      })}
    </>
  )
}

function SubagentCard({ subagent }: { subagent: SubagentHandle }) {
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
      {subagent.messages.map((childMessage) => (
        <div key={childMessage.id} className="mt-2">
          <MessageBody message={childMessage} />
        </div>
      ))}
    </section>
  )
}

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const visibleMessages = messages.filter((message) =>
    message.parts.some((part) => {
      if (part.type === 'text' && part.content.trim()) return true
      return part.type === 'subagent'
    }),
  )

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [visibleMessages])

  if (!visibleMessages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Blog desk
          </h2>
          <p className="text-sm text-gray-400">
            Paste an OpenRouter key. Ask for research or a draft. Jev picks the
            agent.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {visibleMessages.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-orange-500 to-red-600'
                  : 'bg-gray-700'
              }`}
            >
              {message.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <MessageBody message={message} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, subagents, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    byok,
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <OpenRouterKeyForm />
        </div>

        <Messages messages={messages} />

        {subagents.length > 0 ? (
          <aside className="border-t border-orange-500/10 px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Subagents
            </h2>
            {subagents.map((subagent) => (
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

        {error ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error.message}
          </div>
        ) : null}

        <div className="border-t border-orange-500/10 bg-gray-900/80">
          <div className="w-full px-4 py-3">
            {isLoading ? (
              <div className="mb-3 flex items-center justify-center">
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask for research, or ask for a draft..."
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={1}
                disabled={isLoading}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    input.trim()
                  ) {
                    event.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
```

## 10. Try it

1. Run the app.
2. Paste an OpenRouter key.
3. Make sure that `TYPESAFE_API_KEY` is set on the server.
4. Send `What are three facts about durable streams?` The researcher card opens.
5. Send `Write a short blog post about durable streams.` The writer card opens.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/subagents`.

<!-- ::client-example library=ai framework=react slug=subagents -->

You have a blog desk. Jev picks the specialist. The nested card shows the child as it streams.

The full example is on GitHub: [TanStack/ai `examples/react/subagents`](https://github.com/TanStack/ai/tree/main/examples/react/subagents).

For the API, open [Subagents](../chat/subagents).
