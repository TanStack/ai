---
title: React Chat UI
id: typed-headless-ui-react
order: 1
description: "Build a typed, headless React chat UI with createChatUI. Your chat options control the types of tools, parts, and interrupts."
keywords:
  - tanstack ai
  - createChatUI
  - react
  - headless ui
  - useChat
  - ToolProps
---

Install `@tanstack/ai-react-ui`, then call `createChatUI(chatOptions)` once at module scope. Your app owns `useChat`. The UI only renders. Call `UI.useChat()` inside a mapped component when it needs live chat. That call is the same value you passed into `UI.Chat`.

You supply every visible component. There is no default markup, style, or copy.

`defineComponents` needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional.

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
import { createChatUI } from '@tanstack/ai-react-ui'
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

const UI = createChatUI(chatOptions)

const components = UI.defineComponents({
  layout: function Layout({
    renderMessages,
    renderInterrupts,
    renderInput,
  }) {
    const chat = UI.useChat()
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
  input: function Input() {
    const chat = UI.useChat()
    return (
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
    )
  },
  parts: {
    text: ({ part }) => <p>{part.content}</p>,
    structuredOutput: ({ part }) => <pre>{part.raw}</pre>,
    toolResult: ({ part }) => <em>{String(part.content)}</em>,
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
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

## Type a component in its own file

A tool map grows fast. Move a tool into its own file and type the props with `ToolProps`.

`ToolProps` takes your `chatOptions` type and the tool name. Then `part.input` and `part.output` stay exact.

Part components work the same way. `PartProps<typeof chatOptions, 'text'>` already has a text part. You do not check `part.type`. Use `'structuredOutput'`, `'thinking'`, `'toolResult'`, and the other keys from the `parts` map. `fallback` still sees every part type.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatUI, type PartProps, type ToolProps } from '@tanstack/ai-react-ui'
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

export function TextPart({ part }: PartProps<typeof chatOptions, 'text'>) {
  return <p>{part.content}</p>
}

const UI = createChatUI(chatOptions)

export const components = UI.defineComponents({
  layout: ({ renderMessages }) => renderMessages(),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  parts: { text: TextPart, fallback: () => null },
  tools: { getWeather: WeatherTool },
})
```

1. Put `chatOptions` in a shared module.
2. Import `ToolProps` or `PartProps` from `@tanstack/ai-react-ui`.
3. Type the component with `ToolProps<typeof chatOptions, 'getWeather'>` or `PartProps<typeof chatOptions, 'text'>`.
4. Pass that component into `tools.getWeather` or `parts.text`.

For an interrupt, use `InterruptProps`. Pass a tool name or a registered interrupt id as the second type argument. Then you do not check `interrupt.kind`.

- A tool approval: `InterruptProps<typeof chatOptions, 'purchaseItem'>`. Then `interrupt.toolName` is `'purchaseItem'`.
- A registered generic interrupt: `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` and `interrupt.resolveInterrupt` match the definition.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatUI, type InterruptProps } from '@tanstack/ai-react-ui'
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
}: InterruptProps<typeof chatOptions, 'choosePlan'>) {
  return (
    <button onClick={() => interrupt.resolveInterrupt('approved')}>
      {interrupt.payload?.title ?? 'Choose plan'}
    </button>
  )
}

const UI = createChatUI(chatOptions)

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
- `PartProps` with a part key such as `'text'`
- `InterruptProps` for tool approvals, registered generic interrupts, and `generic.fallback`. Pass a tool name or interrupt id as the second type argument.

## Read chat from `UI.useChat()`

Mapped components do not receive `chat` as a prop. Call `UI.useChat()` inside a component when it needs live chat. That call opts the component into chat re-renders. Nested children can call it too.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createChatUI } from '@tanstack/ai-react-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const UI = createChatUI(chatOptions)

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

Read `interrupt` on the tool. Render the approval in that same component. Do not register `interrupts.tools` for that name. A mapped tool keeps its approval off the list.

`interrupt` is already the approval for that tool name. You do not check `interrupt.kind`.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createChatUI, type ToolProps } from '@tanstack/ai-react-ui'
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

const UI = createChatUI(chatOptions)

function PurchaseItem({
  part,
  interrupt,
}: ToolProps<typeof chatOptions, 'purchaseItem'>) {
  return (
    <div>
      {part.input?.item}
      {interrupt?.status === 'pending' ? (
        <button onClick={() => interrupt.resolveInterrupt(true)}>
          Approve
        </button>
      ) : null}
    </div>
  )
}

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
    purchaseItem: PurchaseItem,
  },
})

export function InlineApprovalChat() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

To split the approval into its own file, type it with `InterruptProps<typeof chatOptions, 'purchaseItem'>`. Render that component from the tool.

### List, in `renderInterrupts()`

Register the approval under `interrupts.tools`. That component appears in the interrupt list. Do not also render `interrupt` on the tool unless you want it in both places.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createChatUI } from '@tanstack/ai-react-ui'
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

const UI = createChatUI(chatOptions)

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
      purchaseItem: ({ interrupt }) => (
        <button onClick={() => interrupt.resolveInterrupt(true)}>
          Approve
        </button>
      ),
    },
  },
})

export function ListApprovalChat() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

## Generic interrupts

Generic interrupts always render in the list (`renderInterrupts()` / `<UI.Interrupts>`). They never render inside a tool.

Map them under `interrupts.generic`:

- A registered id such as `choosePlan`: the component for that definition
- `fallback`: every other list interrupt, including an unknown generic id and an unbound interrupt this chat does not own

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createChatUI } from '@tanstack/ai-react-ui'
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

const UI = createChatUI(chatOptions)

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
import { createChatUI } from '@tanstack/ai-react-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const UI = createChatUI(chatOptions)

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
