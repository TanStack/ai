---
title: React Chat UI
id: typed-headless-ui-react
order: 1
description: "Render a typed chat tree with Chat and a component map. Your chat options control the types of tools, parts, and interrupts."
keywords:
  - tanstack ai
  - Chat
  - react
  - headless ui
  - useChat
  - ToolProps
---

Install `@tanstack/ai-react`. Import `Chat` from `@tanstack/ai-react/ui`. Call `useChat(chatOptions)` in the screen. Pass a module-level `components` object into `Chat`.

You supply every visible component. There is no default markup, style, or copy.

The map needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional.

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
    adapter: openaiText('gpt-5.6'),
    messages: Array.isArray(messages) ? messages : [],
  })
  return toServerSentEventsResponse(stream)
}
```

## Client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { Chat, type ChatUIComponents } from '@tanstack/ai-react/ui'
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

const components = {
  layout: ({ chat, renderMessages, renderInterrupts, renderInput }) => {
    if (chat.error) return <p>{chat.error.message}</p>
    return (
      <main>
        {renderMessages()}
        {renderInterrupts()}
        {renderInput()}
      </main>
    )
  },
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  input: ({ chat }) => (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const field = form.elements.namedItem('message')
        if (!(field instanceof HTMLInputElement)) return
        void chat.sendMessage(field.value)
        field.value = ''
      }}
    >
      <input name="message" />
      <button type="submit">Send</button>
    </form>
  ),
  parts: {
    text: ({ part }) => (part.type === 'text' ? <p>{part.content}</p> : null),
    structuredOutput: ({ part }) =>
      part.type === 'structured-output' ? <pre>{part.raw}</pre> : null,
    fallback: () => null,
  },
  tools: {
    getWeather: ({ part }) => <p>{part.input?.city}</p>,
    purchaseItem: ({ part, interrupt }) => (
      <div>
        {part.input?.item}
        {interrupt?.status === 'pending' ? (
          <button onClick={() => interrupt.resolveInterrupt(true)}>
            Approve
          </button>
        ) : null}
      </div>
    ),
  },
  interrupts: {
    generic: {
      choosePlan: ({ interrupt }) => (
        <button onClick={() => interrupt.resolveInterrupt('approved')}>
          {interrupt.payload?.title ?? 'Choose plan'}
        </button>
      ),
      fallback: ({ interrupt }) => <p>{interrupt.reason}</p>,
    },
  },
} satisfies ChatUIComponents<typeof chatOptions>

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <Chat chat={chat} components={components} />
}
```

## Type a component in its own file

Use `ToolProps`, `PartProps`, `InterruptProps`, `LayoutProps`, or `InputProps` with `typeof chatOptions`.

```tsx
import type { ToolProps } from '@tanstack/ai-react/ui'
import type { chatOptions } from './options'

export function WeatherTool({
  part,
}: ToolProps<typeof chatOptions, 'getWeather'>) {
  return <p>{part.input?.city}</p>
}
```

`layout` and `input` receive `chat` as a prop. Nested children can call `useChatContext()` inside `Chat`.

## Tool approvals

A mapped tool that is not listed under `interrupts.tools` keeps its approval off the list. Read `interrupt` on the tool.

If you register `interrupts.tools.purchaseItem`, that component renders in `renderInterrupts()` instead.

Generic interrupts always render in the list.

Unknown runtime tool names warn once in development and render nothing. Add `parts.fallback` for unknown part types.
