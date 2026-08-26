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
  - ToolProps
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
    generic: {
      choosePlan: ({ interrupt }) => (
        <button onClick={() => interrupt.resolveInterrupt('approved')}>
          {interrupt.payload?.title ?? 'Choose plan'}
        </button>
      ),
      fallback: ({ interrupt }) => <p>{interrupt.reason}</p>,
    },
  },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

## Type a component in its own file

A tool map grows fast. Move a tool into its own file and type the props with `ToolProps`.

`ToolProps` takes your `chatOptions` type and the tool name. Then `part.input` and `part.output` stay exact.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createUI, type ToolProps } from '@tanstack/ai-react-ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [getWeather],
}

export function WeatherTool({
  part,
  result,
}: ToolProps<typeof chatOptions, 'getWeather'>) {
  if (part.state === 'awaiting-input') return <p>Waiting</p>
  if (part.state === 'input-streaming') return <p>Streaming input</p>
  if (part.state === 'error') return <p>Error</p>
  return (
    <p>
      {part.input?.city}: {String(part.output?.temperature ?? result?.content)}
    </p>
  )
}

const UI = createUI(chatOptions)

export const components = UI.defineComponents({
  layout: ({ renderMessages }) => renderMessages(),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
  tools: { getWeather: WeatherTool },
})
```

1. Put `chatOptions` in a shared module.
2. Import `ToolProps` from `@tanstack/ai-react-ui`.
3. Type the component with `ToolProps<typeof chatOptions, 'getWeather'>`.
4. Pass that component into `tools.getWeather`.

For a registered generic interrupt, use `RegisteredInterruptProps`. Then `interrupt.payload` and `interrupt.resolveInterrupt` match the definition.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createUI, type RegisteredInterruptProps } from '@tanstack/ai-react-ui'
import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  interrupts: [choosePlan],
}

export function ChoosePlan({
  interrupt,
}: RegisteredInterruptProps<typeof chatOptions, 'choosePlan'>) {
  return (
    <button onClick={() => interrupt.resolveInterrupt('approved')}>
      {interrupt.payload?.title ?? 'Choose plan'}
    </button>
  )
}

const UI = createUI(chatOptions)

export const components = UI.defineComponents({
  layout: ({ renderInterrupts }) => renderInterrupts(),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
  interrupts: {
    generic: {
      choosePlan: ChoosePlan,
    },
  },
})
```

Other prop types from the same package:

- `LayoutProps`
- `MessageProps`
- `InputProps`
- `PartProps`
- `InterruptProps` for tool approvals and `generic.fallback`

## Read chat from `UI.useChat()`

Every mapped component already gets `chat` as a prop. Nested children that you write yourself can call `UI.useChat()` instead of threading that prop.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const UI = createUI(chatOptions)

function StatusLine() {
  const chat = UI.useChat()
  if (chat.error) return <p>{chat.error.message}</p>
  if (chat.isLoading) return <p>Loading</p>
  return <p>{chat.messages.length} messages</p>
}

const components = UI.defineComponents({
  layout: ({ renderMessages, renderInput }) => (
    <main>
      <StatusLine />
      {renderMessages()}
      {renderInput()}
    </main>
  ),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

Call `UI.useChat()` only inside `UI.Chat` or `UI.Provider`. A call outside that tree throws.

`useChat(chatOptions)` from `@tanstack/ai-react` still owns the state. `UI.useChat()` only reads the instance that you passed into the provider.

## Tool approvals: inline or list

A tool with `needsApproval: true` can render its approval in two places.

### Inline, next to the tool

Set `placement: 'inline'`. Call `renderInterrupt()` inside the tool component. The approval appears in the tool slot. It does not appear in the interrupt list.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const purchaseItem = toolDefinition({
  name: 'purchaseItem',
  description: 'Buy an item',
  needsApproval: true,
  inputSchema: z.object({ item: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [purchaseItem],
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: ({ renderMessages, renderInterrupts }) => (
    <main>
      {renderMessages()}
      {renderInterrupts()}
    </main>
  ),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
  tools: {
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
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
          ) : null,
        placement: 'inline',
      },
    },
  },
})

export function InlineApprovalChat() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

### List, in `renderInterrupts()`

Pass the approval component directly. Do not set `placement: 'inline'`. The tool can skip `renderInterrupt()`. The approval appears in the interrupt list.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const purchaseItem = toolDefinition({
  name: 'purchaseItem',
  description: 'Buy an item',
  needsApproval: true,
  inputSchema: z.object({ item: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [purchaseItem],
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: ({ renderMessages, renderInterrupts }) => (
    <main>
      {renderMessages()}
      {renderInterrupts()}
    </main>
  ),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
  tools: {
    purchaseItem: ({ part }) => <div>{part.input?.item}</div>,
  },
  interrupts: {
    tools: {
      purchaseItem: ({ interrupt }) =>
        interrupt.kind === 'tool-approval' ? (
          <button onClick={() => interrupt.resolveInterrupt(true)}>
            Approve
          </button>
        ) : null,
    },
  },
})

export function ListApprovalChat() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

`placement: 'list'` is the same as a direct component.

## Generic interrupts

Generic interrupts always render in the list (`renderInterrupts()` / `<UI.Interrupts>`). They never render inside a tool.

Map them under `interrupts.generic`:

- A registered id such as `choosePlan`: the component for that definition
- `fallback`: every other list interrupt, including an unknown generic id and an unbound interrupt this chat does not own

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createUI } from '@tanstack/ai-react-ui'
import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  interrupts: [choosePlan],
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: ({ renderInterrupts }) => renderInterrupts(),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { fallback: () => null },
  interrupts: {
    generic: {
      choosePlan: ({ interrupt }) => (
        <button onClick={() => interrupt.resolveInterrupt('approved')}>
          {interrupt.payload?.title ?? 'Choose plan'}
        </button>
      ),
      fallback: ({ interrupt }) =>
        interrupt.kind === 'unbound' ? (
          <p>Paused elsewhere: {interrupt.reason}</p>
        ) : (
          <p>{interrupt.reason}</p>
        ),
    },
  },
})

export function GenericInterruptChat() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

You can mix this map with `interrupts.tools` in the same `defineComponents` call.

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

Unknown runtime tool names warn once in development and render nothing. Add a `parts.fallback` for unknown part types.

See also [Solid](./solid), [Vue](./vue), [Svelte](./svelte), and [custom adapters](./custom-adapters).
