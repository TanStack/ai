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
  - 'TanStack/ai:docs/resumable-streams/overview.md'
  - 'TanStack/ai:docs/chat/persistence.md'
  - 'TanStack/ai:docs/persistence/client-persistence.md'
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
          adapter: openaiText('gpt-5.5'),
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
  modelOptions: {
    temperature: 0.7,
    max_tokens: 2000, // Anthropic-native key
  },
  systemPrompts: ['You are a helpful assistant.'],
  abortController,
})

return toServerSentEventsResponse(stream, { abortController })
```

To make the SSE response resumable (reconnect after a drop/refresh without
re-running the provider), pass a delivery-durability adapter:
`toServerSentEventsResponse(stream, { durability: { adapter: memoryStream(request) } })`
(`memoryStream` from `@tanstack/ai` is process-local, for dev/tests) or
`durableStream(request, { server })` from `@tanstack/ai-durable-stream`
(Durable Streams protocol, production). Each SSE event gets an opaque
adapter-owned `id:`; `fetchServerSentEvents` auto-reconnects with
`Last-Event-ID` and exposes `joinRun(runId)` to replay a run from the start.
See `docs/resumable-streams/overview.md`.

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

### 4. Sending Audio Messages (Browser Recording)

Use `useAudioRecorder` from `@tanstack/ai-react` (or `createAudioRecorder` in Svelte) to capture audio in the browser. The resolved `AudioRecording` includes a ready-to-use `part` that slots directly into `sendMessage`.

```typescript
import {
  useAudioRecorder,
  useChat,
  fetchServerSentEvents,
} from '@tanstack/ai-react'

const { isRecording, isSupported, start, stop } = useAudioRecorder()
const { sendMessage } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})

async function toggle() {
  if (!isRecording) {
    await start()
    return
  }
  const recording = await stop()
  await sendMessage({ content: [recording.part] })
}
```

`recording.part` is `{ type: 'audio', source: { type: 'data', value: base64, mimeType } }`. Returns the recorder's native format (`audio/webm` or `audio/mp4`) with no transcoding.

### 5. HTTP Stream Format (Alternative to SSE)

Use `toHttpResponse` + `fetchHttpStream` for newline-delimited JSON instead of SSE.

**Server:**

```typescript
import { chat, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.5'),
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

This includes resumability: pass the same `durability` adapter to
`toHttpResponse(stream, { durability: { adapter: memoryStream(request) } })` and
each NDJSON line becomes an `{ id, chunk }` envelope. `fetchHttpStream`
auto-reconnects with `Last-Event-ID`, de-dupes the replayed prefix, and exposes
`joinRun(runId)` — the same guarantees as resumable SSE. The XHR adapters
(`xhrServerSentEvents` / `xhrHttpStream`) are resumable too.

### 6. MCP Tool Discovery via `chat({ mcp })`

Pass `mcp` to let `chat()` own discovery **and** lifecycle for one or more MCP
clients. Useful when you want minimal boilerplate and don't need to reuse the
clients across calls.

```typescript
// Prop shape:
// chat({
//   ...,
//   mcp: {
//     clients: Array<MCPClient | MCPClients>,
//     connection?: 'close' | 'keep-alive',  // default: 'close'
//     lazyTools?: boolean,
//     onDiscoveryError?: (error: unknown, source) => void,
//   }
// })
```

- **`clients`** — one or more `MCPClient` / `MCPClients` instances.
- **`connection`** — `'close'` (default) closes each client when the run ends
  (after the agent loop completes and the stream is drained); with
  `'keep-alive'`, `chat()` never closes the clients — the caller owns their
  lifecycle (keep connections warm across requests).
- **`lazyTools`** — forwarded to `tools({ lazy: true })` so tool schemas are
  sent to the LLM on demand.
- **`onDiscoveryError`** — throw (or re-throw) to fail the entire call fast;
  return normally to skip that source and continue. Omit to rethrow (fail-fast).

**When to use `mcp` vs. the tools spread:**

| Approach                                                | Use when                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `chat({ mcp: { clients: [...] } })`                     | You want discovery + lifecycle managed for you, and don't need fully-typed input/output schemas |
| `tools: [...await client.tools([toolDefinition(...)])]` | You want fully-typed MCP tools with Zod input/output validation                                 |

**Server-side example:**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcpClient = await createMCPClient({
          transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: {
            clients: [mcpClient],
            connection: 'keep-alive', // chat() won't close it — reuse across requests
          },
        })

        return toServerSentEventsResponse(stream)
        // connection: 'keep-alive' — chat() never closes mcpClient; it stays open for reuse across runs.
      },
    },
  },
})
```

### 7. Queueing Messages Sent While Streaming

By default, a `sendMessage` call that arrives while a stream is in flight is
**queued** and sent automatically once the run settles **successfully** —
this is a behavior change: such sends used to be silently dropped. Configure
it with the `queue` option on `useChat`:

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const { messages, queue, sendMessage, cancelQueued, isLoading } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  queue: { whenBusy: 'queue', drain: 'fifo', maxSize: 5, onOverflow: 'reject' },
})
```

- **`whenBusy`** — `'queue'` (default) holds the message until a successful
  settle; `'drop'` ignores the send (never appears in `queue`/`messages`);
  `'interrupt'` aborts the current stream and sends immediately (unlike
  `stop()`, does **not** flush already-queued items — they drain after the
  interrupting send **succeeds**).
- **`drain`** — `'fifo'` (default) sends queued items one at a time in
  order; `'batch'` merges everything queued into a single send once the
  run settles successfully.
- **`maxSize`** / **`onOverflow`** — cap the queue length; `'reject'`
  (default) silently ignores overflow sends (does not throw),
  `'drop-oldest'` evicts the oldest queued item to make room.

The top-level `queue` option also accepts a plain `WhenBusy` string
shorthand (e.g. `queue: 'interrupt'`) or a `QueueStrategy` function for
per-send action control. Strategy form always drains FIFO; actions are
`'queue' | 'drop' | 'interrupt'`.

**Drain vs flush:** queued messages auto-send only after a **successful**
settle. They are **discarded** on stream error/abort of the active
generation, `stop()`, `clear()`, `unsubscribe()`, and `reload()`.
`interrupt` does not flush.

`queue: Array<QueuedMessage>` (`{ id, content, createdAt }`) is separate
from `messages` — render pending sends distinctly and cancel with
`cancelQueued(id)`:

```typescript
{queue.map((q) => (
  <div key={q.id}>
    {typeof q.content === 'string' ? q.content : '[attachment]'}
    <button onClick={() => cancelQueued(q.id)}>Cancel</button>
  </div>
))}
```

Override the configured policy for a single send with the second argument
to `sendMessage`:

```typescript
sendMessage('Never mind, do this instead', { whenBusy: 'interrupt' })
```

### 8. Browser-Refresh Durability (client persistence)

By default a `ChatClient` / `useChat` keeps messages in memory only, so a full
page reload loses the conversation. The optional `persistence` option (a
`ChatClientPersistence` adapter) fixes this from the client side: it stores one
combined record — `{ messages, resume? }` (`ChatPersistedState`) — per chat `id`,
so a reload restores the transcript **and** rehydrates any pending interrupt /
rejoins a run that was still streaming. No manual `initialMessages` + `onFinish`
boilerplate.

Three storage adapters ship from `@tanstack/ai-client`:
`localStoragePersistence` (survives reloads and browser restarts),
`sessionStoragePersistence` (scoped to the tab), and `indexedDBPersistence`
(async, structured-clone storage — no codec needed for `Date`/`Map`/etc.).
Give the chat a stable `threadId` so the reload finds the same record.
Persistence keys on `threadId`; the storage adapters are re-exported from each
framework package, so a single import works:

```typescript
import {
  useChat,
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-react'

// Defaults to the ChatPersistedState shape and a JSON codec, so no type
// argument or serialize/deserialize is needed. indexedDBPersistence stores via
// structured clone (a Date round-trips exactly).
const persistence = localStoragePersistence()

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence,
  })
  // ...render messages, call sendMessage(text)
}
```

**Keep large transcripts off the client.** `persistence` also accepts the object
form `{ store, messages?: boolean }`. `messages: false` caches only the tiny
resume pointer (which run to rejoin, which interrupts are pending), so durability
rejoin and interrupt restore still work while the transcript stays off the client
and the server stays authoritative for history. A bare adapter is shorthand for
`{ store, messages: true }`. With `messages: false`, hydrate the reload display
from the server (a loader that reads `messages.loadThread(id)`), since the
delivery log only holds one run.

**Mid-stream reload rejoin.** If the run was still streaming when the page
reloaded, the client re-attaches instead of showing a frozen half-reply — but
only when the connection is **resumable**: a delivery-durability-backed route
that records the stream and exposes a GET replay handler (see
`docs/resumable-streams/overview.md` and Pattern 1's `durability` adapter). Given
that, `useChat` finds the persisted in-flight run on load and auto-rejoins it via
`joinRun`, replaying from the server's log so the reply finishes where it left
off. No extra client code beyond the resumable connection.

**Every framework, no extra code.** Durability rides the existing `persistence`
option, so it works identically in `@tanstack/ai-react`, `-solid`, `-vue`,
`-svelte`, `-angular`, and `-preact` — pass `persistence` (and a stable `id`) to
the framework's `useChat` / `createChat` / `injectChat`; nothing is
framework-specific.

> **Client vs. server durability.** This is the client (per-browser) half.
> The authoritative, multi-user, server-side copy is the `withChatPersistence`
> middleware — see ai-core/middleware/SKILL.md. The two are independent; use
> both for instant reload restore plus a durable record of record.

## Common Mistakes

### a. CRITICAL: Using Vercel AI SDK patterns (streamText, generateText)

```typescript
// WRONG
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
const result = streamText({ model: openai('gpt-5.5'), messages })

// CORRECT
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
const stream = chat({ adapter: openaiText('gpt-5.5'), messages })
```

### b. CRITICAL: Using Vercel createOpenAI() provider pattern

```typescript
// WRONG
import { createOpenAI } from '@ai-sdk/openai'
const openai = createOpenAI({ apiKey })
streamText({ model: openai('gpt-5.5'), messages })

// CORRECT
import { openaiText } from '@tanstack/ai-openai'
import { chat } from '@tanstack/ai'
chat({ adapter: openaiText('gpt-5.5'), messages })
```

### c. CRITICAL: Using monolithic openai() instead of openaiText()

```typescript
// WRONG
import { openai } from '@tanstack/ai-openai'
chat({ adapter: openai(), model: 'gpt-5.5', messages })

// CORRECT
import { openaiText } from '@tanstack/ai-openai'
chat({ adapter: openaiText('gpt-5.5'), messages })
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
chat({ adapter: openaiText(), model: 'gpt-5.5', messages })

// CORRECT
chat({ adapter: openaiText('gpt-5.5'), messages })
```

The model is passed to the adapter factory, not to `chat()`.

### f. HIGH: Passing sampling options at the root of chat()

Sampling options (`temperature`, token limits, `top_p`/`topP`) are **not**
top-level fields on `chat()`. They live inside `modelOptions` using the
provider's native key.

```typescript
// WRONG — temperature/maxTokens are not root options
chat({ adapter, messages, temperature: 0.7, maxTokens: 1000 })

// WRONG — there is no `options` field either
chat({ adapter, messages, options: { temperature: 0.7, maxTokens: 1000 } })

// CORRECT — inside modelOptions, provider-native keys (OpenAI shown)
chat({
  adapter,
  messages,
  modelOptions: { temperature: 0.7, max_output_tokens: 1000 },
})
```

`temperature` is universal across providers; token limits use provider-native
keys (`max_output_tokens` for OpenAI, `max_tokens` for Anthropic/Grok,
`maxOutputTokens` for Gemini, `max_completion_tokens` for Groq,
`maxCompletionTokens` for OpenRouter, and `num_predict` nested under
`modelOptions.options` for Ollama). See ai-core/adapter-configuration/SKILL.md.

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
- See also: **ai-core/middleware/SKILL.md** -- Use middleware for analytics and lifecycle events; `withChatPersistence` is the server (authoritative) half of the client `persistence` option
