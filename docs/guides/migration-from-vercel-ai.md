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
| `ai/react` | `@tanstack/ai-react` |
| `ai/vue` | `@tanstack/ai-vue` |
| `ai/solid` | `@tanstack/ai-solid` |
| `ai/svelte` | `@tanstack/ai-svelte` |

## Installation

### Before (Vercel AI SDK)

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
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
import { chat, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages,
  })

  return toStreamResponse(stream)
}
```

### Key Differences

| Vercel AI SDK | TanStack AI | Notes |
|--------------|-------------|-------|
| `streamText()` | `chat()` | Main text generation function |
| `openai('gpt-4o')` | `openaiText('gpt-4o')` | Activity-specific adapters |
| `result.toDataStreamResponse()` | `toStreamResponse(stream)` | Separate utility function |
| `model` parameter | `adapter` parameter | Model baked into adapter |

### Generation Options

#### Before (Vercel AI SDK)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
  // Provider-specific options
  experimental_providerMetadata: {
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
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    ...messages,
  ],
})
```

## Client-Side Migration

### Basic useChat Hook

#### Before (Vercel AI SDK)

```typescript
import { useChat } from 'ai/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
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

| Vercel AI SDK | TanStack AI | Notes |
|--------------|-------------|-------|
| `api: '/api/chat'` | `connection: fetchServerSentEvents('/api/chat')` | Explicit connection adapter |
| `input`, `handleInputChange` | Manage state yourself | More control, less magic |
| `handleSubmit` | `sendMessage(input)` | Direct message sending |
| `m.content` | `message.parts` | Content in structured parts |
| `append(message)` | `append(message)` | Same pattern |
| `reload()` | `reload()` | Same pattern |
| `stop()` | `stop()` | Same pattern |
| `setMessages()` | `setMessages()` | Same pattern |

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
interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]  // Structured content parts
}

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown; output?: unknown; state: ToolCallState }
  | { type: 'tool-result'; toolCallId: string; output: unknown }
```

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

#### Before (Vercel AI SDK)

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
      parameters: z.object({
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
| `parameters` | `inputSchema` |
| N/A | `outputSchema` (optional, enables full type safety) |
| `execute` inline | `.server()` or `.client()` methods |
| Object with tool names as keys | Array of tools |

### Client-Side Tools

#### Before (Vercel AI SDK)

```typescript
const { messages } = useChat({
  api: '/api/chat',
  onToolCall: async ({ toolCall }) => {
    if (toolCall.toolName === 'showNotification') {
      showNotification(toolCall.args.message)
      return { success: true }
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
{message.parts.map((part) => {
  if (part.type === 'tool-call' && part.state === 'approval-requested') {
    return (
      <div>
        <p>Approve booking flight {part.input.flightId}?</p>
        <button onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}>
          Approve
        </button>
        <button onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}>
          Deny
        </button>
      </div>
    )
  }
})}
```

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

#### Before (Vercel AI SDK)

```typescript
// Data stream (default)
return result.toDataStreamResponse()

// Text stream
return result.toTextStreamResponse()
```

#### After (TanStack AI)

```typescript
import { chat, toStreamResponse, toServerSentEventsStream, toHttpStream } from '@tanstack/ai'

const stream = chat({ adapter: openaiText('gpt-4o'), messages })

// SSE format (recommended)
return toStreamResponse(stream)

// Or manual SSE
const sseStream = toServerSentEventsStream(stream, abortController)
return new Response(sseStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
})

// HTTP stream (newline-delimited JSON)
const httpStream = toHttpStream(stream, abortController)
return new Response(httpStream, {
  headers: { 'Content-Type': 'application/x-ndjson' },
})
```

### Client Connection Adapters

#### Before (Vercel AI SDK)

```typescript
// Automatic based on response headers
useChat({ api: '/api/chat' })
```

#### After (TanStack AI)

```typescript
import { fetchServerSentEvents, fetchHttpStream, stream } from '@tanstack/ai-react'

// SSE (matches toStreamResponse)
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

#### Before (Vercel AI SDK)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  abortSignal: controller.signal,
})
```

#### After (TanStack AI)

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

#### Before (Vercel AI SDK)

```typescript
const { messages } = useChat({
  api: '/api/chat',
  onResponse: (response) => console.log('Response started'),
  onFinish: (message) => console.log('Finished:', message),
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

### Before (Vercel AI SDK)

```typescript
// server/api/chat.ts
import { streamText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages,
    temperature: 0.7,
    tools: {
      getWeather: tool({
        description: 'Get weather',
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => fetchWeather(city),
      }),
    },
  })

  return result.toDataStreamResponse()
}

// components/Chat.tsx
import { useChat } from 'ai/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat()

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} disabled={isLoading} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

### After (TanStack AI)

```typescript
// server/api/chat.ts
import { chat, toStreamResponse, toolDefinition } from '@tanstack/ai'
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
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...messages,
    ],
    temperature: 0.7,
    tools: [getWeather],
  })

  return toStreamResponse(stream)
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
