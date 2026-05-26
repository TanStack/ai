---
name: ai-core/chat-experience
description: >
  End-to-end chat implementation: server endpoint with chat() and
  toServerSentEventsResponse(), client-side useChat hook with
  fetchServerSentEvents(), message rendering with UIMessage parts,
  multimodal content, thinking/reasoning display. Covers streaming
  states, connection adapters, and message format conversions.
  NOT Vercel AI SDK — uses chat() not streamText().
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/getting-started/quick-start.md'
  - 'TanStack/ai:docs/chat/streaming.md'
  - 'TanStack/ai:docs/chat/connection-adapters.md'
  - 'TanStack/ai:docs/chat/thinking-content.md'
  - 'TanStack/ai:docs/advanced/multimodal-content.md'
---

# Chat Experience

This skill builds on ai-core. Read it first for critical rules.

## Setup — Minimal Chat App

### Server: API Route (TanStack Start)

```typescript
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const body = await request.json()
        const { messages } = body

        const stream = chat({
          adapter: openaiText('gpt-5.2'),
          messages,
          systemPrompts: ['You are a helpful assistant.'],
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
```

### Client: React Component

```typescript
// src/routes/index.tsx
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

function ChatPage() {
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const handleSubmit = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div>
      <div>
        {messages.map((message: UIMessage) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts.map((part, i) => {
              if (part.type === 'text') {
                return <p key={i}>{part.content}</p>
              }
              return null
            })}
          </div>
        ))}
      </div>

      {error && <div>Error: {error.message}</div>}

      <div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={isLoading}
          placeholder="Type a message..."
        />
        {isLoading ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button onClick={handleSubmit} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
```

Vue/Solid/Svelte/Preact have identical patterns with different hook imports
(e.g., `import { useChat } from '@tanstack/ai-solid'`).

## Core Patterns

### 1. Streaming Chat with SSE

Server returns a streaming SSE Response; client parses it automatically.

**Server:**

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const stream = chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  temperature: 0.7,
  maxTokens: 2000,
  systemPrompts: ['You are a helpful assistant.'],
  abortController,
})

return toServerSentEventsResponse(stream, { abortController })
```

**Client:**

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const { messages, sendMessage, isLoading, error, stop, status } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  body: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  onFinish: (message) => {
    console.log('Response complete:', message.id)
  },
  onError: (err) => {
    console.error('Stream error:', err)
  },
})
```

The `body` field is merged into the POST request body alongside `messages`,
letting the server read `data.provider`, `data.model`, etc.

The `status` field tracks the chat lifecycle: `'ready'` | `'submitted'` | `'streaming'` | `'error'`.

### 2. Rendering Thinking/Reasoning Content

Models with extended thinking (Claude, Gemini) emit `ThinkingPart` in the message parts array.

```typescript
import type { UIMessage } from '@tanstack/ai-react'

function MessageRenderer({ message }: { message: UIMessage }) {
  return (
    <div>
      {message.parts.map((part, i) => {
        if (part.type === 'thinking') {
          const isComplete = message.parts
            .slice(i + 1)
            .some((p) => p.type === 'text')
          return (
            <details key={i} open={!isComplete}>
              <summary>{isComplete ? 'Thought process' : 'Thinking...'}</summary>
              <pre>{part.content}</pre>
            </details>
          )
        }

        if (part.type === 'text' && part.content) {
          return <p key={i}>{part.content}</p>
        }

        if (part.type === 'tool-call') {
          return (
            <div key={part.id}>
              Tool call: {part.name} ({part.state})
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
```

Server-side, enable thinking via `modelOptions` on the adapter:

```typescript
import { geminiText } from '@tanstack/ai-gemini'

const stream = chat({
  adapter: geminiText('gemini-2.5-flash'),
  messages,
  modelOptions: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 100,
    },
  },
})
```

### 3. Sending Multimodal Content (Images)

Use `sendMessage` with a `MultimodalContent` object instead of a plain string.

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import type { ContentPart } from '@tanstack/ai'

const { sendMessage } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function sendImageMessage(text: string, imageBase64: string, mimeType: string) {
  const contentParts: Array<ContentPart> = [
    { type: 'text', content: text },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType },
    },
  ]

  sendMessage({ content: contentParts })
}

function sendImageUrl(text: string, imageUrl: string) {
  const contentParts: Array<ContentPart> = [
    { type: 'text', content: text },
    {
      type: 'image',
      source: { type: 'url', value: imageUrl },
    },
  ]

  sendMessage({ content: contentParts })
}
```

Render image parts in received messages:

```typescript
if (part.type === 'image') {
  const src =
    part.source.type === 'url'
      ? part.source.value
      : `data:${part.source.mimeType};base64,${part.source.value}`
  return <img key={i} src={src} alt="Attached image" />
}
```

### 4. HTTP Stream Format (Alternative to SSE)

Use `toHttpResponse` + `fetchHttpStream` for newline-delimited JSON instead of SSE.

**Server:**

```typescript
import { chat, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  abortController,
})

return toHttpResponse(stream, { abortController })
```

**Client:**

```typescript
import { useChat, fetchHttpStream } from '@tanstack/ai-react'

const { messages, sendMessage } = useChat({
  connection: fetchHttpStream('/api/chat'),
})
```

The only difference is swapping `toServerSentEventsResponse` / `fetchServerSentEvents`
for `toHttpResponse` / `fetchHttpStream`. Everything else stays identical.

## Common Mistakes

### a. CRITICAL: Using Vercel AI SDK patterns (streamText, generateText)

```typescript
// WRONG
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
const result = streamText({ model: openai('gpt-4o'), messages })

// CORRECT
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
const stream = chat({ adapter: openaiText('gpt-5.2'), messages })
```

### b. CRITICAL: Using Vercel createOpenAI() provider pattern

```typescript
// WRONG
import { createOpenAI } from '@ai-sdk/openai'
const openai = createOpenAI({ apiKey })
streamText({ model: openai('gpt-4o'), messages })

// CORRECT
import { openaiText } from '@tanstack/ai-openai'
import { chat } from '@tanstack/ai'
chat({ adapter: openaiText('gpt-5.2'), messages })
```

### c. CRITICAL: Using monolithic openai() instead of openaiText()

```typescript
// WRONG
import { openai } from '@tanstack/ai-openai'
chat({ adapter: openai(), model: 'gpt-5.2', messages })

// CORRECT
import { openaiText } from '@tanstack/ai-openai'
chat({ adapter: openaiText('gpt-5.2'), messages })
```

The monolithic `openai()` adapter is deprecated. Use tree-shakeable adapters:
`openaiText()`, `openaiImage()`, `openaiSpeech()`, etc.

### d. HIGH: Using toResponseStream instead of toServerSentEventsResponse

```typescript
// WRONG
import { toResponseStream } from '@tanstack/ai'
return toResponseStream(stream, { abortController })

// CORRECT
import { toServerSentEventsResponse } from '@tanstack/ai'
return toServerSentEventsResponse(stream, { abortController })
```

### e. HIGH: Passing model as separate parameter to chat()

```typescript
// WRONG
chat({ adapter: openaiText(), model: 'gpt-5.2', messages })

// CORRECT
chat({ adapter: openaiText('gpt-5.2'), messages })
```

The model is passed to the adapter factory, not to `chat()`.

### f. HIGH: Nesting temperature/maxTokens in options object

```typescript
// WRONG
chat({ adapter, messages, options: { temperature: 0.7, maxTokens: 1000 } })

// CORRECT
chat({ adapter, messages, temperature: 0.7, maxTokens: 1000 })
```

All parameters are top-level on the `chat()` options object.

### g. HIGH: Using providerOptions instead of modelOptions

```typescript
// WRONG
chat({
  adapter,
  messages,
  providerOptions: { responseFormat: { type: 'json_object' } },
})

// CORRECT
chat({
  adapter,
  messages,
  modelOptions: { responseFormat: { type: 'json_object' } },
})
```

### h. HIGH: Implementing custom SSE stream instead of using toServerSentEventsResponse

```typescript
// WRONG
const readable = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder()
    for await (const chunk of stream) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
    }
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    controller.close()
  },
})
return new Response(readable, {
  headers: { 'Content-Type': 'text/event-stream' },
})

// CORRECT
import { toServerSentEventsResponse } from '@tanstack/ai'
return toServerSentEventsResponse(stream, { abortController })
```

`toServerSentEventsResponse` handles SSE formatting, abort signals,
error events (RUN_ERROR), and correct headers automatically.

### i. HIGH: Implementing custom onEnd/onFinish callbacks instead of middleware

```typescript
// WRONG
chat({
  adapter,
  messages,
  onEnd: (result) => {
    trackAnalytics(result)
  },
})

// CORRECT
import type { ChatMiddleware } from '@tanstack/ai'

const analytics: ChatMiddleware = {
  name: 'analytics',
  onFinish(ctx, info) {
    trackAnalytics({ reason: info.finishReason, iterations: ctx.iteration })
  },
  onUsage(ctx, usage) {
    trackTokens(usage.totalTokens)
  },
}

chat({ adapter, messages, middleware: [analytics] })
```

`chat()` has no `onEnd`/`onFinish` option. Use `middleware` for lifecycle events.
See also: ai-core/middleware/SKILL.md.

### j. HIGH: Importing from @tanstack/ai-client instead of framework package

```typescript
// WRONG
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

// CORRECT
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
```

Framework packages re-export everything needed from `@tanstack/ai-client`.
Import from `@tanstack/ai-client` only in vanilla JS (no framework).

### k. MEDIUM: Not handling RUN_ERROR events in streaming context

Streaming errors arrive as `RUN_ERROR` events in the stream, not as thrown
exceptions. The `useChat` hook surfaces these via the `error` state and
`onError` callback. If you consume the stream manually (without `useChat`),
check for `RUN_ERROR` chunks:

```typescript
for await (const chunk of stream) {
  if (chunk.type === 'RUN_ERROR') {
    console.error('Stream error:', chunk.error.message)
    break
  }
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta)
  }
}
```

If not handled, the UI appears to hang with no feedback.

## Cross-References

- See also: **ai-core/tool-calling/SKILL.md** -- Most chats include tools
- See also: **ai-core/adapter-configuration/SKILL.md** -- Adapter choice affects available features
- See also: **ai-core/middleware/SKILL.md** -- Use middleware for analytics and lifecycle events
