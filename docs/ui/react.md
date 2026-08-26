---
title: React Chat UI
id: typed-headless-ui-react
order: 1
description: "Build a typed, headless React chat UI with createUI. Your chat options control the types of tools, parts, and interrupts."
keywords:
  - tanstack ai
  - createUI
  - react
  - headless ui
  - useChat
---

Install `@tanstack/ai-react-ui`, then call `createUI(chatOptions)` once at module scope. Your app owns `useChat`. The UI only renders.

You supply every visible component. There is no default markup, style, or copy.

## Server

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const json: unknown = await request.json()
  if (typeof json !== 'object' || json === null || !('messages' in json)) {
    return new Response('Invalid body', { status: 400 })
  }
  const messages = json.messages
  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages: Array.isArray(messages) ? messages : [],
  })
  return toServerSentEventsResponse(stream)
}
```

## Client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'
import { defineInterrupt, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const purchaseItem = toolDefinition({
  name: 'purchaseItem',
  description: 'Buy an item',
  needsApproval: true,
  inputSchema: z.object({ item: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
}).client()

const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [getWeather, purchaseItem],
  interrupts: [choosePlan],
  outputSchema: z.object({ answer: z.string() }),
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: function Layout({
    chat,
    renderMessages,
    renderInterrupts,
    renderInput,
  }) {
    if (chat.error) return <p>{chat.error.message}</p>
    if (chat.isLoading && chat.messages.length === 0) return <p>Loading</p>
    if (chat.messages.length === 0) return <p>Empty</p>
    return (
      <main>
        {renderMessages()}
        {renderInterrupts()}
        {renderInput()}
      </main>
    )
  },
  message: function Message({ message, renderParts }) {
    return <article data-role={message.role}>{renderParts()}</article>
  },
  input: function Input({ chat }) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const field = form.elements.namedItem('message')
          if (!(field instanceof HTMLInputElement)) return
          void chat.sendMessage?.(field.value)
          field.value = ''
        }}
      >
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    )
  },
  parts: {
    text: ({ part }) => (part.type === 'text' ? <p>{part.content}</p> : null),
    structuredOutput: ({ part }) =>
      part.type === 'structured-output' ? (
        <pre>{part.raw}</pre>
      ) : null,
    toolResult: ({ part }) =>
      part.type === 'tool-result' ? <em>{String(part.content)}</em> : null,
    fallback: ({ part }) => <span>{part.type}</span>,
  },
  tools: {
    getWeather: ({ part, result }) => {
      if (part.state === 'awaiting-input') return <p>Waiting</p>
      if (part.state === 'input-streaming') return <p>Streaming input</p>
      if (part.state === 'input-complete') return <p>{part.input?.city}</p>
      if (part.state === 'approval-requested') return <p>Need approval</p>
      if (part.state === 'approval-responded') return <p>Responded</p>
      if (part.state === 'error') return <p>Error</p>
      return (
        <p>
          {part.input?.city}: {String(part.output?.temperature ?? result?.content)}
        </p>
      )
    },
    purchaseItem: ({ part, renderInterrupt }) => (
      <div>
        {part.input?.item}
        {renderInterrupt()}
      </div>
    ),
  },
  interrupts: {
    tools: {
      purchaseItem: {
        component: ({ interrupt }) =>
          interrupt.kind === 'tool-approval' ? (
            interrupt.status === 'pending' ? (
              <button onClick={() => interrupt.resolveInterrupt(true)}>
                Approve
              </button>
            ) : (
              <span>{interrupt.status}</span>
            )
          ) : null,
        placement: 'inline',
      },
    },
    registered: {
      choosePlan: ({ interrupt }) => (
        <button onClick={() => interrupt.resolveInterrupt('approved')}>
          {interrupt.payload?.title ?? 'Choose plan'}
        </button>
      ),
    },
    generic: ({ interrupt }) => <p>{interrupt.reason}</p>,
    unbound: ({ interrupt }) => <p>{interrupt.reason}</p>,
    fallback: ({ interrupt }) => <p>{interrupt.reason}</p>,
  },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

## Manual traversal

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: ({ renderMessages }) => renderMessages(),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
})

export function ManualChat() {
  const chat = useChat(chatOptions)
  return (
    <UI.Provider chat={chat} components={components}>
      <UI.Messages>
        {(messages) =>
          messages.map((message) => (
            <UI.Message key={message.id} message={message}>
              {(parts) =>
                parts.map((part, index) => (
                  <span key={index}>{part.key}</span>
                ))
              }
            </UI.Message>
          ))
        }
      </UI.Messages>
    </UI.Provider>
  )
}
```

Read chat from context with `UI.useChat()` inside the provider.

Unknown runtime tool names warn once in development and render nothing. Add a `parts.fallback` for unknown part types.

See also [Solid](./solid), [Vue](./vue), [Svelte](./svelte), and [custom adapters](./custom-adapters).
