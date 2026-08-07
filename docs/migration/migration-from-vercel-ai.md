---
title: Migration from Vercel AI SDK
id: migration-from-vercel-ai
order: 2
description: "Port from Vercel AI SDK (ai / @ai-sdk/*) to TanStack AI — streamText, useChat, tools, middleware, structured output, agent loop."
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

# Migration from Vercel AI SDK

If you use Vercel AI SDK (`ai` + `@ai-sdk/*`) → map each surface below. "Before" examples target **AI SDK v5/v6** (v4 called out where it differs).

## Packages

| Vercel AI SDK | TanStack AI |
|--------------|-------------|
| `ai` | `@tanstack/ai` |
| `@ai-sdk/openai` | `@tanstack/ai-openai` |
| `@ai-sdk/anthropic` | `@tanstack/ai-anthropic` |
| `@ai-sdk/google` | `@tanstack/ai-gemini` |
| `@ai-sdk/react` | `@tanstack/ai-react` |
| `@ai-sdk/vue` / `@ai-sdk/solid` / `@ai-sdk/svelte` | `@tanstack/ai-vue` / `-solid` / `-svelte` |

```bash
# Before (v5+)
npm install ai @ai-sdk/react @ai-sdk/openai @ai-sdk/anthropic

# After
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-anthropic
```

## Server: basic chat

```typescript
// Before
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

```typescript
// After
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages, // no convertToModelMessages
  })
  return toServerSentEventsResponse(stream)
}
```

| Vercel | TanStack |
|--------------|-------------|
| `streamText()` | `chat()` |
| `generateText()` | `chat({ stream: false })` → `Promise<string>` |
| `generateObject` / `streamObject` / `Output.object()` | `chat({ outputSchema })` |
| `openai('gpt-4o')` | `openaiText('gpt-4o')` |
| `toUIMessageStreamResponse()` | `toServerSentEventsResponse(stream)` |

## `streamText` options → `chat()`

| `streamText` | `chat()` | Notes |
|----|----|----|
| `model: openai('gpt-4o')` | `adapter: openaiText('gpt-4o')` | Activity-specific adapters |
| `prompt: 'Hello'` | `messages: [{ role: 'user', content: 'Hello' }]` | Messages-only |
| `system: '…'` | `systemPrompts: ['…']` | `string[]` |
| `tools: { name: tool({…}) }` | `tools: [toolInstance, …]` | Array, not keyed object |
| `toolChoice` / `topK` / penalties / `seed` / stop | `modelOptions.*` (provider keys) | Not top-level |
| `maxOutputTokens` / `temperature` / `topP` | `modelOptions` native keys | See [sampling migration](./sampling-options-to-model-options) |
| `abortSignal` | `abortController` | Pass the controller |
| `providerOptions: { openai: {…} }` | `modelOptions: {…}` | Flat; adapter knows provider |
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` | Default maxIterations(5) |
| `stopWhen: [a, b]` | `combineStrategies([a, b])` | AND |
| `prepareStep` / `experimental_transform` | `middleware` (`onConfig` / `onChunk`) | See Middleware |
| `output: Output.object({ schema })` | `outputSchema` | Structured Output |

### Result accessors

| `streamText` result | TanStack |
|---|---|
| `result.fullStream` | Stream from `chat()` is the full `AsyncIterable<StreamChunk>` |
| `result.text` | `streamToText(stream)` or `chat({ stream: false })` |
| `result.usage` / `finishReason` / steps | `middleware.onUsage` / `onFinish` / `onIteration` |
| `toUIMessageStreamResponse()` | `toServerSentEventsResponse(stream)` |
| `toTextStreamResponse()` | `streamToText` + `Response`, or `toHttpResponse` + client `fetchHttpStream` |

## Generation options + system prompts

```typescript
// After — sampling + provider knobs in modelOptions
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  systemPrompts: [
    'You are a helpful assistant.',
    'Respond in concise, plain English.',
  ],
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
    top_p: 0.9,
    service_tier: 'default',
  },
})
```

## Client: `useChat`

```tsx
// After
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
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
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null,
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

| Vercel (v5+) | TanStack |
|----|----|
| `transport: new DefaultChatTransport({ api })` | `connection: fetchServerSentEvents(url)` |
| `sendMessage({ text })` | `sendMessage(text)` |
| `status` | `isLoading` (boolean) |
| `regenerate()` | `reload()` |
| `addToolOutput` (v6) / `addToolResult` (v5) | `addToolResult` |
| `addToolApprovalResponse` | Prefer `interrupts` + `resolveInterrupt` — [Tool Approval](../interrupts/tool-approval) |

### Message parts

Render `message.parts` (`text` | `thinking` | `tool-call` | `tool-result`). No separate `reasoning` / `source-url` / `file` part types — thinking → `thinking`; citations via metadata or tool outputs.

```tsx ignore
{messages.map((message) => (
  <div key={message.id}>
    {message.parts.map((part, idx) => {
      if (part.type === 'text') return <span key={idx}>{part.content}</span>
      if (part.type === 'thinking') return <em key={idx}>{part.content}</em>
      if (part.type === 'tool-call') {
        return (
          <div key={part.id}>
            Tool: {part.name} - {JSON.stringify(part.output)}
          </div>
        )
      }
      return null
    })}
  </div>
))}
```

## Tools

Define once; implement with `.server()` / `.client()`.

```typescript
import { chat, toolDefinition, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { fetchWeather } from './weather'

const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
})

const getWeather = getWeatherDef.server(async ({ location }) => {
  return fetchWeather(location)
})

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools: [getWeather],
  })
  return toServerSentEventsResponse(stream)
}
```

| Vercel | TanStack |
|---|---|
| `parameters` (v4) / `inputSchema` (v5+) | `inputSchema` |
| — | optional `outputSchema` |
| Inline `execute` | `.server()` / `.client()` |
| Keyed object | Array of instances |

### Client tools

Pass `.client()` tools into `useChat({ tools })` — handlers run automatically (no `onToolCall` / manual `addToolResult`).

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { toast } from './toast'

const showNotification = toolDefinition({
  name: 'showNotification',
  description: 'Show a toast notification in the browser',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
}).client(({ message }) => {
  toast(message)
  return { success: true }
})

const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: [showNotification],
})
```

### Tool approval

Use `needsApproval: true` + `interrupts` / `resolveInterrupt`. Full pattern: [Tool Approval](../interrupts/tool-approval).

## Structured output

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const profile = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Extract the user profile from this bio…' }],
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
    interests: z.array(z.string()),
  }),
})
// profile typed; Promise<T> when outputSchema set (stream flag ignored for await)
```

Standard Schema (Zod 4.2+, ArkType, Valibot) or plain JSON Schema (`unknown`). Partial object streaming like Vercel `elementStream` is not built-in yet. See [Structured Outputs](../structured-outputs/overview).

## Agent loop

| Vercel | TanStack |
|---|---|
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` |
| `stopWhen: hasToolCall('x')` | Custom strategy inspecting messages |
| `stopWhen: [a, b]` | `combineStrategies([a, b])` |
| `prepareStep` | `middleware.onConfig` / `onIteration` |

```typescript
import {
  chat,
  combineStrategies,
  maxIterations,
  untilFinishReason,
  toServerSentEventsResponse,
  type ChatMiddleware,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { getWeather } from './tools'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    tools: [getWeather],
    agentLoopStrategy: combineStrategies([
      maxIterations(10),
      untilFinishReason(['stop']),
    ]),
    middleware: [
      {
        onConfig: (ctx, config) => {
          if (ctx.iteration > 0) return undefined
        },
      } satisfies ChatMiddleware,
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

No mid-loop adapter swap in one `chat()` call — end the loop and start a new `chat()` with another adapter + prior messages.

## Middleware

Vercel `wrapLanguageModel` + `experimental_transform` → single `middleware: ChatMiddleware[]` on `chat()`.

```typescript
import { chat, toServerSentEventsResponse, type ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

type AppContext = { userId: string }

const loggingMiddleware: ChatMiddleware<AppContext> = {
  onStart: (ctx) => console.log('start', ctx.requestId),
  onChunk: (_ctx, chunk) => chunk,
  onFinish: (_ctx, info) => console.log('finish', info),
  onError: (_ctx, err) => console.error(err),
}

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
    middleware: [loggingMiddleware],
    context: { userId: 'u_123' },
  })
  return toServerSentEventsResponse(stream)
}
```

| Hook | When |
|------|------|
| `onStart` / `onConfig` | Run start; before each model call (return partial config) |
| `onChunk` | Each chunk (return chunk / array / `null` to drop) |
| `onBeforeToolCall` / `onAfterToolCall` | Tool args rewrite / after execute |
| `onUsage` / `onFinish` / `onAbort` / `onError` | Usage + terminal |

Built-in cache: `toolCacheMiddleware` from `@tanstack/ai/middlewares`. Observability: use middleware + your tracer (`ctx.requestId` / `ctx.streamId` are stable). Guides: [Middleware](../advanced/middleware), [Runtime context](../advanced/runtime-context).

## Providers

```typescript ignore
// OpenAI
import { openaiText, openaiImage, openaiSpeech } from '@tanstack/ai-openai'
chat({ adapter: openaiText('gpt-4o'), ... })
generateImage({ adapter: openaiImage('dall-e-3'), ... })
// Embeddings: provider SDK or vector DB — not in TanStack AI

// Anthropic
import { anthropicText } from '@tanstack/ai-anthropic'
chat({ adapter: anthropicText('claude-sonnet-4-5-20250514'), ... })

// Gemini
import { geminiText } from '@tanstack/ai-gemini'
chat({ adapter: geminiText('gemini-2.5-flash'), ... })
```

## Streaming response helpers

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toHttpResponse,
  toServerSentEventsStream,
  toHttpStream,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST() {
  const abortController = new AbortController()
  const messages = [{ role: 'user' as const, content: 'Hello' }]
  const stream = chat({ adapter: openaiText('gpt-4o'), messages })

  return toServerSentEventsResponse(stream, {
    abortController,
    headers: { 'X-Trace-Id': 'trace-123' },
  })
  // or toHttpResponse(stream, { abortController }) for NDJSON
  // raw: toServerSentEventsStream / toHttpStream
}
```

Client: `fetchServerSentEvents` | `fetchHttpStream` | `stream(customIterable)`.

## Abort + multimodal + dynamic provider

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const imageUrl = 'https://example.com/photo.jpg'
const imageData = 'base64...'
const selectedProvider = 'openai' as const

// AbortController (not bare signal)
const abortController = new AbortController()
chat({ adapter: openaiText('gpt-4o'), messages, abortController })
abortController.abort()

// Multimodal
chat({
  adapter: openaiText('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'Describe this image' },
        { type: 'image', source: { type: 'url', value: imageUrl } },
        {
          type: 'image',
          source: { type: 'data', value: imageData, mimeType: 'image/png' },
        },
      ],
    },
  ],
})

// Dynamic provider
const adapters = {
  openai: () => openaiText('gpt-4o'),
  anthropic: () => anthropicText('claude-sonnet-4-5'),
} as const
chat({ adapter: adapters[selectedProvider](), messages })
```

## Type safety

```typescript
import { createChatClientOptions, type InferChatMessages } from '@tanstack/ai-client'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { updateUI, saveData } from './tools'

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('/api/chat'),
  tools: [updateUI, saveData],
})
type ChatMessages = InferChatMessages<typeof chatOptions>
```

`modelOptions` autocomplete follows the exact adapter + model.

## Non-streaming

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const text = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Summarize TanStack AI in one sentence.' }],
  stream: false,
})
// or streamToText(chat({ ... }))
```

## Not covered yet

- **Embeddings** — provider SDK / vector DB
- **Partial object streaming** — no `elementStream` equivalent; use stream + own parser if required
- **Built-in maxRetries / timeout** — `AbortSignal.timeout` + middleware/fetch retries

## Complete example

```tsx ignore
// server/api/chat.ts
import { chat, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { fetchWeather } from './weather'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number(), conditions: z.string() }),
}).server(async ({ city }) => fetchWeather(city))

export async function POST(request: Request) {
  const { messages } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    systemPrompts: ['You are a helpful assistant.'],
    messages,
    modelOptions: { temperature: 0.7 },
    tools: [getWeather],
  })
  return toServerSentEventsResponse(stream)
}

// components/Chat.tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !isLoading) {
            sendMessage(input)
            setInput('')
          }
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={isLoading} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

## Help

1. [Quick Start](../getting-started/quick-start)
2. [Tools](../tools/tools) · [Tool Approval](../interrupts/tool-approval)
3. [Structured Outputs](../structured-outputs/overview)
4. [Middleware](../advanced/middleware)
5. [API Reference](../api/ai)
