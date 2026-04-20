---
title: Migration from Vercel AI SDK
id: migration-from-vercel-ai
order: 19
---

# Migration from Vercel AI SDK

This guide helps you migrate from the Vercel AI SDK (`ai` package) to TanStack AI. While both libraries solve similar problems, TanStack AI offers a different architecture with enhanced type safety, tree-shakeable adapters, and an isomorphic tool system.

## Why Migrate?

TanStack AI provides several advantages:

- **Tree-shakeable adapters** - Import only what you need, reducing bundle size
- **Isomorphic tools** - Define tools once, implement for server and client separately
- **Per-model type safety** - TypeScript knows exact options available for each model
- **Framework agnostic** - Works with React, Vue, Solid, Svelte, and vanilla JS
- **Full streaming type safety** - Typed stream chunks and message parts

## Quick Reference

| Vercel AI SDK | TanStack AI |
|--------------|-------------|
| `ai` | `@tanstack/ai` |
| `@ai-sdk/openai` | `@tanstack/ai-openai` |
| `@ai-sdk/anthropic` | `@tanstack/ai-anthropic` |
| `@ai-sdk/google` | `@tanstack/ai-gemini` |
| `@ai-sdk/react` | `@tanstack/ai-react` |
| `@ai-sdk/vue` | `@tanstack/ai-vue` |
| `@ai-sdk/solid` | `@tanstack/ai-solid` |
| `@ai-sdk/svelte` | `@tanstack/ai-svelte` |

> **Note:** Since AI SDK v5, framework hooks moved from `ai/react` (v4) to dedicated packages like `@ai-sdk/react`. If you are on v4, swap the old subpaths for their v5 equivalents.

## Installation

### Before (Vercel AI SDK)

```bash
# v5+ (framework hook lives in @ai-sdk/react)
npm install ai @ai-sdk/react @ai-sdk/openai @ai-sdk/anthropic
```

### After (TanStack AI)

```bash
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-anthropic
```

## Server-Side Migration

### Basic Text Generation

#### Before (Vercel AI SDK)

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  return result.toDataStreamResponse()
}
```

#### After (TanStack AI)

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

### Key Differences

| Vercel AI SDK | TanStack AI | Notes |
|--------------|-------------|-------|
| `streamText()` | `chat()` | Main text generation function |
| `openai('gpt-4o')` | `openaiText('gpt-4o')` | Activity-specific adapters |
| `result.toUIMessageStreamResponse()` / `.toTextStreamResponse()` | `toServerSentEventsResponse(stream)` / `toHttpResponse(stream)` | Separate utility functions |
| `model` parameter | `adapter` parameter | Model baked into adapter |

### Generation Options

#### Before (Vercel AI SDK)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  temperature: 0.7,
  maxOutputTokens: 1000, // (v5+); `maxTokens` on v4
  topP: 0.9,
  // Provider-specific options (v5+)
  providerOptions: {
    openai: {
      responseFormat: { type: 'json_object' },
    },
  },
})
```

#### After (TanStack AI)

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
  // Provider-specific options (fully typed per model)
  modelOptions: {
    responseFormat: { type: 'json_object' },
  },
})
```

### System Messages

TanStack AI accepts system prompts at the **root level** via the `systemPrompts` option. You pass an array of strings, and each adapter merges them into whatever format the provider expects. You don't manually prepend a `system` message to the `messages` array.

#### Before (Vercel AI SDK)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  messages,
})
```

#### After (TanStack AI)

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  systemPrompts: ['You are a helpful assistant.'],
  messages,
})
```

Multiple system prompts are supported — useful for composing persona, policies, and tool-usage guidance without string concatenation:

```typescript
const stream = chat({
  adapter: openaiText('gpt-4o'),
  systemPrompts: [
    'You are a helpful assistant.',
    'Respond in concise, plain English.',
    'Never fabricate citations.',
  ],
  messages,
})
```

## Client-Side Migration

### Basic useChat Hook

#### Before (Vercel AI SDK v5+)

```typescript
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

#### After (TanStack AI)

```typescript
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

### useChat API Differences

Vercel AI SDK v5+ already moved away from the magic `input`/`handleInputChange`/`handleSubmit` of v4 and now expects you to manage your own input state. TanStack AI follows that same philosophy — the hook is headless and gives you building blocks instead of form glue.

| Vercel AI SDK (v5+) | TanStack AI | Notes |
|--------------------|-------------|-------|
| `transport: new DefaultChatTransport({ api: '/api/chat' })` | `connection: fetchServerSentEvents('/api/chat')` | Pluggable connection adapter |
| `sendMessage({ text })` | `sendMessage(text)` | Accepts plain string; pass `UIMessage` objects via `append()` |
| `status` (`'submitted' \| 'streaming' \| 'ready' \| 'error'`) | `isLoading` (boolean) | Coarser in TanStack; full stream state available via events |
| `regenerate()` | `reload()` | Re-runs the last assistant turn |
| `stop()` | `stop()` | Cancel the in-flight stream |
| `setMessages(messages)` | `setMessages(messages)` | Direct message replacement |
| `addToolResult({ tool, toolCallId, output })` | `addToolResult({ tool, toolCallId, output })` | Resolve a tool call from the client |
| N/A | `addToolApprovalResponse({ id, approved })` | First-class user-approval flow for tools |
| `m.parts` (typed union) | `message.parts` (typed union) | Both render via structured parts |

### Message Structure

#### Before (Vercel AI SDK)

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolInvocations?: ToolInvocation[]
}
```

#### After (TanStack AI)

```typescript
interface UIMessage<TTools extends ReadonlyArray<AnyClientTool> = any> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TTools>>
  createdAt?: Date
}

type MessagePart<TTools> =
  | TextPart
  | ToolCallPart<TTools>
  | ToolResultPart
  | ThinkingPart

interface TextPart {
  type: 'text'
  content: string
}

interface ThinkingPart {
  type: 'thinking'
  content: string
}

interface ToolCallPart {
  type: 'tool-call'
  id: string
  name: string
  arguments: string          // Raw JSON string (may be partial while streaming)
  input?: unknown            // Parsed input (typed when tools are typed)
  output?: unknown           // Execution output once available
  state: ToolCallState
  approval?: {
    id: string               // Approval request ID
    needsApproval: boolean
    approved?: boolean       // undefined until the user responds
  }
}

interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string
  state: ToolResultState
  error?: string             // Present when state is 'error'
}

type ToolCallState =
  | 'awaiting-input'
  | 'input-streaming'
  | 'input-complete'
  | 'approval-requested'
  | 'approval-responded'

type ToolResultState = 'streaming' | 'complete' | 'error'
```

> TanStack AI does not have separate `reasoning`, `source-url`, `source-document`, or `file` part types that you may have seen in other SDKs. Provider-specific reasoning traces arrive as `thinking` parts; citations and inline files are surfaced through `metadata` on text parts or through your tool outputs.

### Rendering Messages

#### Before (Vercel AI SDK)

```typescript
{messages.map((m) => (
  <div key={m.id}>
    {m.role}: {m.content}
    {m.toolInvocations?.map((tool) => (
      <div key={tool.toolCallId}>
        Tool: {tool.toolName} - {JSON.stringify(tool.result)}
      </div>
    ))}
  </div>
))}
```

#### After (TanStack AI)

```typescript
{messages.map((message) => (
  <div key={message.id}>
    {message.role}:{' '}
    {message.parts.map((part, idx) => {
      if (part.type === 'text') {
        return <span key={idx}>{part.content}</span>
      }
      if (part.type === 'thinking') {
        return <em key={idx}>Thinking: {part.content}</em>
      }
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

## Tools / Function Calling

TanStack AI uses an isomorphic tool system where you define the schema once and implement it separately for server and client.

### Basic Tool Definition

#### Before (Vercel AI SDK v5+)

```typescript
import { streamText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

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

#### After (TanStack AI)

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

// Step 1: Define the tool schema
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

// Step 2: Create server implementation
const getWeather = getWeatherDef.server(async ({ location }) => {
  const weather = await fetchWeather(location)
  return weather
})

// Step 3: Use in chat
const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: [getWeather],
})
```

### Tool Schema Differences

| Vercel AI SDK | TanStack AI |
|--------------|-------------|
| `parameters` (v4) / `inputSchema` (v5+) | `inputSchema` |
| N/A | `outputSchema` (optional — enables end-to-end type safety) |
| `execute` inline on the server | `.server()` or `.client()` methods (isomorphic definition) |
| Object with tool names as keys | Array of tool instances |

### Client-Side Tools

#### Before (Vercel AI SDK v5+)

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { useChat } from '@ai-sdk/react'

const { messages, addToolResult } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onToolCall: async ({ toolCall }) => {
    if (toolCall.toolName === 'showNotification') {
      showNotification(toolCall.input.message)
      addToolResult({
        tool: 'showNotification',
        toolCallId: toolCall.toolCallId,
        output: { success: true },
      })
    }
  },
})
```

#### After (TanStack AI)

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'

// Define once (can be shared with server)
const showNotificationDef = toolDefinition({
  name: 'showNotification',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
})

// Client implementation
const showNotification = showNotificationDef.client(({ message }) => {
  toast(message)
  return { success: true }
})

// Use in component
const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: clientTools(showNotification), // Auto-executed
})
```

### Tool Approval Flow

#### Before (Vercel AI SDK)

```typescript
// Custom implementation required
```

#### After (TanStack AI)

```typescript
// Built-in approval support
const bookFlightDef = toolDefinition({
  name: 'bookFlight',
  inputSchema: z.object({ flightId: z.string() }),
  needsApproval: true, // Request user approval
})

// In component
const { messages, addToolApprovalResponse } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})

// Render approval UI
{message.parts.map((part, idx) => {
  if (
    part.type === 'tool-call' &&
    part.state === 'approval-requested' &&
    part.approval
  ) {
    return (
      <div key={idx}>
        <p>Approve booking flight {part.input?.flightId}?</p>
        <button
          onClick={() => addToolApprovalResponse({ id: part.approval!.id, approved: true })}
        >
          Approve
        </button>
        <button
          onClick={() => addToolApprovalResponse({ id: part.approval!.id, approved: false })}
        >
          Deny
        </button>
      </div>
    )
  }
  return null
})}
```

> `part.input` is the **parsed** tool input (typed when your tools are typed via `clientTools()` + `InferChatMessages`). The raw streaming JSON is available as `part.arguments` if you need to show progress before input parsing completes.

## Provider Adapters

TanStack AI uses activity-specific adapters for optimal tree-shaking.

### OpenAI

#### Before (Vercel AI SDK)

```typescript
import { openai } from '@ai-sdk/openai'

// Chat
streamText({ model: openai('gpt-4o'), ... })

// Embeddings
embed({ model: openai.embedding('text-embedding-3-small'), ... })

// Image generation
generateImage({ model: openai.image('dall-e-3'), ... })
```

#### After (TanStack AI)

```typescript
import { openaiText, openaiImage, openaiSpeech } from '@tanstack/ai-openai'

// Chat
chat({ adapter: openaiText('gpt-4o'), ... })

// Image generation
generateImage({ adapter: openaiImage('dall-e-3'), ... })

// Text to speech
generateSpeech({ adapter: openaiSpeech('tts-1'), ... })

// Embeddings: Use OpenAI SDK directly or your vector DB's built-in support
```

### Anthropic

#### Before (Vercel AI SDK)

```typescript
import { anthropic } from '@ai-sdk/anthropic'

streamText({ model: anthropic('claude-sonnet-4-5-20250514'), ... })
```

#### After (TanStack AI)

```typescript
import { anthropicText } from '@tanstack/ai-anthropic'

chat({ adapter: anthropicText('claude-sonnet-4-5-20250514'), ... })
```

### Google (Gemini)

#### Before (Vercel AI SDK)

```typescript
import { google } from '@ai-sdk/google'

streamText({ model: google('gemini-1.5-pro'), ... })
```

#### After (TanStack AI)

```typescript
import { geminiText } from '@tanstack/ai-gemini'

chat({ adapter: geminiText('gemini-1.5-pro'), ... })
```

## Streaming Responses

### Server Response Formats

#### Before (Vercel AI SDK v5+)

```typescript
// UI message stream (default, for useChat)
return result.toUIMessageStreamResponse()

// Plain text stream
return result.toTextStreamResponse()
```

#### After (TanStack AI)

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toServerSentEventsStream,
  toHttpResponse,
  toHttpStream,
} from '@tanstack/ai'

const stream = chat({ adapter: openaiText('gpt-4o'), messages })

// SSE response (recommended; pairs with fetchServerSentEvents on the client)
return toServerSentEventsResponse(stream)

// Newline-delimited JSON response (pairs with fetchHttpStream on the client)
return toHttpResponse(stream)

// Lower-level: get the ReadableStream and build your own Response
const sseStream = toServerSentEventsStream(stream, abortController)
return new Response(sseStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
})

const httpStream = toHttpStream(stream, abortController)
return new Response(httpStream, {
  headers: { 'Content-Type': 'application/x-ndjson' },
})
```

### Client Connection Adapters

#### Before (Vercel AI SDK v5+)

```typescript
import { DefaultChatTransport } from 'ai'

useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})
```

#### After (TanStack AI)

```typescript
import { fetchServerSentEvents, fetchHttpStream, stream } from '@tanstack/ai-react'

// SSE (matches toServerSentEventsResponse)
useChat({ connection: fetchServerSentEvents('/api/chat') })

// HTTP stream (matches toHttpStream)
useChat({ connection: fetchHttpStream('/api/chat') })

// Custom adapter
useChat({
  connection: stream(async (messages, data, signal) => {
    // Custom implementation
    return processedStream
  }),
})
```

## AbortController / Cancellation

### Before (Vercel AI SDK)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  abortSignal: controller.signal,
})
```

### After (TanStack AI)

TanStack AI takes an `AbortController` (not a bare signal) so helpers like `toServerSentEventsStream` can wire cancellation into the response stream for you.

```typescript
const abortController = new AbortController()

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  abortController,
})

// Cancel the stream
abortController.abort()
```

## Callbacks and Events

### Stream Callbacks

#### Before (Vercel AI SDK v5+)

```typescript
const { messages } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onFinish: ({ message }) => console.log('Finished:', message),
  onError: (error) => console.error('Error:', error),
})
```

#### After (TanStack AI)

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  onResponse: (response) => console.log('Response started'),
  onChunk: (chunk) => console.log('Chunk received:', chunk),
  onFinish: (message) => console.log('Finished:', message),
  onError: (error) => console.error('Error:', error),
})
```

TanStack AI also lets you hook into the **server-side** stream lifecycle by subscribing to the async iterable returned from `chat()`, which preserves the full typed `StreamChunk` union — useful for logging, analytics, or sending custom SSE events alongside the response.

## Multimodal Content

### Image Inputs

#### Before (Vercel AI SDK)

```typescript
streamText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image', image: imageUrl },
      ],
    },
  ],
})
```

#### After (TanStack AI)

```typescript
chat({
  adapter: openaiText('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image', source: { type: 'url', url: imageUrl } },
        // Or base64
        { type: 'image', source: { type: 'base64', base64: imageData, mediaType: 'image/png' } },
      ],
    },
  ],
})
```

## Dynamic Provider Switching

### Before (Vercel AI SDK)

```typescript
const providers = {
  openai: openai('gpt-4o'),
  anthropic: anthropic('claude-sonnet-4-5-20250514'),
}

streamText({
  model: providers[selectedProvider],
  messages,
})
```

### After (TanStack AI)

```typescript
const adapters = {
  openai: () => openaiText('gpt-4o'),
  anthropic: () => anthropicText('claude-sonnet-4-5-20250514'),
}

chat({
  adapter: adapters[selectedProvider](),
  messages,
})
```

## Type Safety Enhancements

TanStack AI provides enhanced type safety that Vercel AI SDK doesn't offer:

### Typed Message Parts

```typescript
import { createChatClientOptions, clientTools, type InferChatMessages } from '@tanstack/ai-client'

const tools = clientTools(updateUI, saveData)

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('/api/chat'),
  tools,
})

// Infer fully typed messages
type ChatMessages = InferChatMessages<typeof chatOptions>

// Now TypeScript knows:
// - Exact tool names available
// - Input types for each tool
// - Output types for each tool
```

### Per-Model Type Safety

```typescript
const adapter = openaiText('gpt-4o')

chat({
  adapter,
  messages,
  modelOptions: {
    // TypeScript autocompletes options specific to gpt-4o
    responseFormat: { type: 'json_object' },
    logitBias: { '123': 1.0 },
  },
})
```

## Removed Features

Some features from Vercel AI SDK are not included in TanStack AI:

### Embeddings

TanStack AI doesn't include embeddings. Use your provider's SDK directly:

```typescript
// Use OpenAI SDK directly
import OpenAI from 'openai'

const openai = new OpenAI()
const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

### generateText (Non-streaming)

TanStack AI focuses on streaming. For non-streaming, collect the stream:

```typescript
import { chat, streamToText } from '@tanstack/ai'

const stream = chat({ adapter: openaiText('gpt-4o'), messages })
const text = await streamToText(stream)
```

## Complete Migration Example

### Before (Vercel AI SDK v5+)

```typescript
// server/api/chat.ts
import { streamText, tool, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: convertToModelMessages(messages),
    temperature: 0.7,
    tools: {
      getWeather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => fetchWeather(city),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}

// components/Chat.tsx
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

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
          {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === 'streaming'}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

### After (TanStack AI)

```typescript
// server/api/chat.ts
import { chat, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number(), conditions: z.string() }),
})

const getWeather = getWeatherDef.server(async ({ city }) => fetchWeather(city))

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    systemPrompts: ['You are a helpful assistant.'],
    messages,
    temperature: 0.7,
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
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null
          )}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

## Need Help?

If you encounter issues during migration:

1. Check the [Quick Start Guide](../getting-started/quick-start) for setup
2. Review the [Tools Guide](./tools) for the isomorphic tool system
3. See [Connection Adapters](./connection-adapters) for streaming options
4. Explore the [API Reference](../api/ai) for complete function signatures
