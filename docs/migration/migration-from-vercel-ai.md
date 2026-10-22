---
title: Migration from Vercel AI SDK
id: migration-from-vercel-ai
order: 2
description: "Port a Vercel AI SDK app (ai and @ai-sdk/*) to TanStack AI: swap the packages, then port the server route, the useChat client, and the tools."
keywords:
  - tanstack ai
  - vercel ai sdk
  - migration
  - streamText
  - generateText
  - generateObject
  - useChat
  - ai sdk v5
  - ai sdk v6
  - middleware
  - agent loop
---

Move a Vercel AI SDK app (`ai` and `@ai-sdk/*`) to TanStack AI by swapping the package names, the server call, the client hook, and the tool helpers.

- `streamText` becomes `chat()`.
- `useChat` from `@ai-sdk/react` becomes `useChat` from `@tanstack/ai-react`.
- `tool()` becomes `toolDefinition()`.

Do the steps below in order. The "Before" samples are AI SDK v5 and v6 code. Where v4 is different, the page says so. For every other API, see [Vercel AI SDK: full API mapping](./migration-from-vercel-ai-advanced).

## Port a chat app

### 1. Swap the packages

| Vercel AI SDK | TanStack AI |
|--------------|-------------|
| `ai` | `@tanstack/ai` |
| `@ai-sdk/openai` | `@tanstack/ai-openai` |
| `@ai-sdk/anthropic` | `@tanstack/ai-anthropic` |
| `@ai-sdk/google` | `@tanstack/ai-gemini` |
| `@ai-sdk/google-vertex` | `@tanstack/ai-vertex` (Gemini), `@tanstack/ai-anthropic/vertex` (Claude), `@tanstack/ai-grok/vertex` (Grok), or `@tanstack/ai-mistral/vertex` (Mistral) |
| `@ai-sdk/react` | `@tanstack/ai-react` |
| `@ai-sdk/vue` | `@tanstack/ai-vue` |
| `@ai-sdk/solid` | `@tanstack/ai-solid` |
| `@ai-sdk/svelte` | `@tanstack/ai-svelte` |

> [!NOTE]
> In AI SDK v4, the framework hooks came from subpaths such as `ai/react`. Since v5, they come from packages such as `@ai-sdk/react`.

Remove the `ai` and `@ai-sdk/*` packages from your `package.json`. Then install TanStack AI with the adapters that you need:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-anthropic
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai @tanstack/ai-anthropic
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai @tanstack/ai-anthropic
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai @tanstack/ai-anthropic
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai @tanstack/ai-anthropic
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai @tanstack/ai-anthropic
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai @tanstack/ai-anthropic
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai @tanstack/ai-anthropic octane

<!-- ::end:tabs -->

### 2. Port the server route

Before (Vercel AI SDK):

```typescript
import { streamText, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
  // (v4: result.toDataStreamResponse())
}
```

After (TanStack AI):

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
  })

  return toServerSentEventsResponse(stream)
}
```

What changed:

- **`model` becomes `adapter`.** The model id goes into an adapter function for one activity: `openai('gpt-4o')` becomes `openaiText('gpt-4o')`.
- **No `convertToModelMessages()`.** `chat()` takes the UI messages from the client as they are. The adapter converts them.
- **The response is a separate helper.** `result.toUIMessageStreamResponse()` becomes `toServerSentEventsResponse(stream)`.

If you set `system`, pass `systemPrompts: ['You are a helpful assistant.']`. If you set `temperature` or `maxOutputTokens`, move them into `modelOptions`. See [Model options](./migration-from-vercel-ai-advanced#model-options).

### 3. Port the client

Before (Vercel AI SDK v5+):

```tsx
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && status !== 'streaming') {
      sendMessage({ text: input })
      setInput('')
    }
  }

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}:{' '}
          {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

After (TanStack AI):

```tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input)
      setInput('')
    }
  }

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role}:{' '}
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null
          )}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

The hook is headless, the same as AI SDK v5 and later. You keep your own input state. The rest maps like this:

| Vercel AI SDK (v5+) | TanStack AI |
|--------------------|-------------|
| `transport: new DefaultChatTransport({ api: '/api/chat' })` | `connection: fetchServerSentEvents('/api/chat')` |
| `sendMessage({ text })` | `sendMessage(text)`. It takes a string or multimodal content. To add a full `UIMessage`, use `append()`. |
| `status` | `status`, with the same four values (`'submitted'`, `'streaming'`, `'ready'`, `'error'`). For a boolean, read `isLoading`. |
| `regenerate()` | `reload()` |
| `stop()` | `stop()` |
| `setMessages(messages)` | `setMessages(messages)` |
| `addToolOutput({ tool, toolCallId, output })` (v6; `addToolResult` in v5) | `addToolResult({ tool, toolCallId, output })` |
| `addToolApprovalResponse({ id, approved })` (v6) | `interrupt.resolveInterrupt(approved)` on a `tool-approval` item from `interrupts` |
| `p.text` on a text part | `part.content` on a text part |

### 4. Port your tools

You define a tool once with `toolDefinition()`. Then you add a `.server()` or a `.client()` implementation.

Before (Vercel AI SDK v5+):

```typescript
import { streamText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { fetchWeather } from './weather'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: {
    getWeather: tool({
      description: 'Get weather for a location',
      inputSchema: z.object({ // renamed from `parameters` in v5
        location: z.string(),
      }),
      execute: async ({ location }) => {
        const weather = await fetchWeather(location)
        return weather
      },
    }),
  },
})
```

After (TanStack AI):

```typescript
import { chat, toolDefinition, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { fetchWeather } from './weather'

// 1. Define the tool
const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a location',
  inputSchema: z.object({
    location: z.string(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
})

// 2. Add the server implementation
const getWeather = getWeatherDef.server(async ({ location }) => {
  const weather = await fetchWeather(location)
  return weather
})

// 3. Use it in chat
export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [getWeather],
  })
  return toServerSentEventsResponse(stream)
}
```

| Vercel AI SDK | TanStack AI |
|--------------|-------------|
| `parameters` (v4) / `inputSchema` (v5+) | `inputSchema` |
| No equivalent | `outputSchema` (optional, types the result from end to end) |
| `execute` on the server | `.server()` or `.client()` on the definition |
| An object with tool names as keys | An array of tools |

Do you have client tools (`onToolCall` with `addToolOutput`) or approvals (`needsApproval`)? See [Client tools](./migration-from-vercel-ai-advanced#client-tools) and [Tool approval](./migration-from-vercel-ai-advanced#tool-approval).

### 5. Run it

Start your app, and send a message. The reply streams in, and the model calls your tools.

## Find the rest of your code

| Vercel AI SDK | TanStack AI | Details |
| --- | --- | --- |
| `generateText()` | `chat({ stream: false })`, which resolves to `{ text, chunks }` | [Non-streaming generation](./migration-from-vercel-ai-advanced#non-streaming-generation-generatetext) |
| `generateObject()`, `streamObject()`, `Output.object()` | `chat({ outputSchema })` | [Structured output](./migration-from-vercel-ai-advanced#structured-output) |
| `stopWhen`, `prepareStep` | `agentLoopStrategy`, `middleware` | [Agent loop control](./migration-from-vercel-ai-advanced#agent-loop-control) |
| `wrapLanguageModel()`, `experimental_transform` | `middleware` | [Middleware](./migration-from-vercel-ai-advanced#middleware) |
| `providerOptions: { openai: {...} }` | `modelOptions: {...}` | [Model options](./migration-from-vercel-ai-advanced#model-options) |
| `embed()`, `embedMany()` | `embed()` | [Embeddings](./migration-from-vercel-ai-advanced#embeddings) |
| Each `streamText` option and result member | | [`streamText` options](./migration-from-vercel-ai-advanced#streamtext-options) |

## Done

Your server route streams with `chat()`, your client renders `message.parts`, and your tools run. No file imports `ai` or `@ai-sdk/*`.
