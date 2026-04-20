---
title: Migration from Vercel AI SDK
id: migration-from-vercel-ai
order: 2
description: "Port an app from the Vercel AI SDK (ai / @ai-sdk/*) to TanStack AI — option-by-option mapping of streamText, generateText, generateObject, useChat, tools, middleware, structured output, and the agent loop."
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

This guide helps you migrate from the Vercel AI SDK (`ai` + `@ai-sdk/*`) to TanStack AI. Both libraries cover the same problem space — LLM calls, streaming, tool use, structured output, framework hooks — but TanStack AI uses a different architecture with enhanced type safety, tree-shakeable adapters, an isomorphic tool system, and a first-class middleware pipeline.

The "Before" examples target **AI SDK v5 and v6**. Older v4 naming is called out inline where it differs.

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
import { streamText, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
  // (v4: result.toDataStreamResponse())
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
| `generateText()` | `chat({ stream: false })` | Returns `Promise<string>` |
| `generateObject()` / `streamObject()` / `Output.object()` | `chat({ outputSchema })` | Returns `Promise<T>` — see [Structured Output](#structured-output) |
| `openai('gpt-4o')` | `openaiText('gpt-4o')` | Activity-specific adapters |
| `result.toUIMessageStreamResponse()` / `.toTextStreamResponse()` | `toServerSentEventsResponse(stream)` / `toHttpResponse(stream)` | Separate utility functions |
| `model` parameter | `adapter` parameter | Model baked into adapter |

### Full `streamText` → `chat()` Option Mapping

Options accepted by `streamText` as of AI SDK v6, and where each lives in TanStack AI's `chat()`. Options that exist on both sides keep the same semantics unless noted.

| `streamText` option | `chat()` equivalent | Notes |
|--------------------|--------------------|-------|
| `model: openai('gpt-4o')` | `adapter: openaiText('gpt-4o')` | Activity-specific adapters |
| `prompt: 'Hello'` | `messages: [{ role: 'user', content: 'Hello' }]` | TanStack is messages-only |
| `messages` | `messages` | Same concept; content parts differ (see [Multimodal](#multimodal-content)) |
| `system: 'You are…'` | `systemPrompts: ['You are…']` | Root-level `string[]` |
| `tools: { name: tool({…}) }` | `tools: [toolInstance, …]` | Array of tool instances instead of a keyed object |
| `toolChoice: 'auto' \| 'required' \| 'none' \| { type, toolName }` | `modelOptions.toolChoice` (provider-specific) | Not a top-level option — set on the adapter's `modelOptions` |
| `activeTools: string[]` | Filter `tools` yourself, or use `prepareStep` equivalent via middleware | No dedicated option — see [Middleware](#middleware) for dynamic tool filtering |
| `maxOutputTokens` | `maxTokens` | Renamed to match the original OpenAI naming |
| `temperature` | `temperature` | Same |
| `topP` | `topP` | Same |
| `topK` | `modelOptions.topK` (where the provider supports it) | Lives under typed `modelOptions` |
| `presencePenalty` | `modelOptions.presencePenalty` | Lives under typed `modelOptions` |
| `frequencyPenalty` | `modelOptions.frequencyPenalty` | Lives under typed `modelOptions` |
| `seed` | `modelOptions.seed` | Lives under typed `modelOptions` |
| `stopSequences` | `modelOptions.stop` (provider-specific) | Lives under typed `modelOptions` |
| `maxRetries` | Wrap your fetch/adapter, or add a retry `middleware` | Not built into `chat()` |
| `timeout` | Combine `abortController` + `AbortSignal.timeout(ms)` | Not built into `chat()` |
| `abortSignal: controller.signal` | `abortController: controller` | Pass the controller itself, not just the signal |
| `headers` | Configure on the adapter (e.g., `openaiText({ headers })`) | Not a per-call option |
| `providerOptions: { openai: { … } }` | `modelOptions: { … }` | Flat; the adapter already knows which provider it is. Typed per model |
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` | See [Agent Loop Control](#agent-loop-control) |
| `stopWhen: hasToolCall('x')` | Custom `AgentLoopStrategy` that inspects `messages` | No built-in "stop on specific tool" preset yet — one-liner custom strategy; see [Agent Loop Control](#agent-loop-control) |
| `stopWhen: [a, b]` | `agentLoopStrategy: combineStrategies([a, b])` | Multiple conditions, AND semantics |
| `prepareStep` | `middleware` with `onConfig`/`onIteration` | See [Middleware](#middleware) |
| `experimental_transform` | `middleware.onChunk` (transform / drop / expand chunks) | See [Middleware](#middleware) |
| `experimental_context` | `context` (root-level) | Passed through to every middleware hook |
| `experimental_telemetry` | `middleware` + your tracer of choice | See [Observability](#observability-logging-metrics-tracing) |
| `experimental_repairToolCall` | `middleware.onBeforeToolCall` | Return transformed args or a decision |
| `experimental_download` | Preprocess your `messages` before calling `chat()` | No built-in hook |
| `onChunk` (streamText) | `middleware.onChunk` | Also reachable by consuming the returned iterable |
| `onError` | `middleware.onError` | Terminal hook |
| `onStepFinish` | `middleware.onIteration` / `onToolPhaseComplete` / `onUsage` | Split into finer-grained hooks |
| `onFinish` | `middleware.onFinish` | Terminal hook |
| `onAbort` | `middleware.onAbort` | Terminal hook |
| `output: Output.object({ schema })` | `outputSchema` | See [Structured Output](#structured-output) |
| — | `conversationId` / `threadId` / `runId` | TanStack-only, for correlating requests across your system and AG-UI |

### `streamText` result → TanStack AI equivalents

`streamText` returns an object with accessor promises; TanStack AI returns the stream directly. Everything you can pull off that object is available via stream consumption, middleware, or response helpers.

| `streamText` result member | TanStack AI equivalent |
|---------------------------|------------------------|
| `result.textStream` | Filter the async iterable: `for await (const c of stream) if (c.type === 'text-delta') …` |
| `result.fullStream` | The `stream` returned by `chat()` **is** the full stream (`AsyncIterable<StreamChunk>`) |
| `result.text` | `await streamToText(stream)` or `chat({ …, stream: false })` |
| `result.content` | Accumulate parts in `middleware.onChunk`, or read the final `UIMessage` in `onFinish` |
| `result.toolCalls` / `result.toolResults` | Read from chunks in `middleware.onChunk` / `onAfterToolCall` |
| `result.usage` / `result.totalUsage` | `middleware.onUsage(ctx, usage)` |
| `result.finishReason` | `middleware.onFinish(ctx, info)` |
| `result.steps` | Accumulate via `middleware.onIteration` / `onToolPhaseComplete` |
| `result.toUIMessageStreamResponse()` | `toServerSentEventsResponse(stream)` |
| `result.toTextStreamResponse()` | Collect with `streamToText(stream)` and return a plain `Response`, **or** pair with the client's `fetchHttpStream` via `toHttpResponse(stream)` |
| `result.pipeUIMessageStreamToResponse(res)` | `toServerSentEventsStream(stream).pipeTo(…)` |
| `result.consumeStream()` | `for await (const _ of stream) {}` |

### Generation Options

TanStack AI promotes a small, cross-provider set of options to the top level (`temperature`, `topP`, `maxTokens`) and pushes everything provider-specific into a single typed `modelOptions` bag. There's no `providerOptions: { openai: {…} }` nesting — the adapter already knows which provider it is, so `modelOptions` is flat and typed against the selected model.

#### Before (Vercel AI SDK v5+)

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  temperature: 0.7,
  maxOutputTokens: 1000, // (v5+); `maxTokens` on v4
  topP: 0.9,
  topK: 40,
  presencePenalty: 0.1,
  frequencyPenalty: 0.1,
  seed: 42,
  stopSequences: ['\n\nUser:'],
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
  // Everything else lives under modelOptions — typed for gpt-4o specifically
  modelOptions: {
    topK: 40,
    presencePenalty: 0.1,
    frequencyPenalty: 0.1,
    seed: 42,
    stop: ['\n\nUser:'],
    responseFormat: { type: 'json_object' },
  },
})
```

> Autocomplete in `modelOptions` reflects the **exact** adapter and model you passed. Swap `openaiText('gpt-4o')` for `anthropicText('claude-sonnet-4-5')` and the shape changes to match Anthropic's options.

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
| `addToolOutput({ tool, toolCallId, output })` (v6; was `addToolResult` in v5) | `addToolResult({ tool, toolCallId, output })` | Resolve a client-side tool call |
| `addToolApprovalResponse({ id, approved })` (v6) | `addToolApprovalResponse({ id, approved })` | First-class user-approval flow for tools |
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

These are the `@tanstack/ai-client` shapes (what `useChat` gives you). The core `@tanstack/ai` message types are similar, but `input` (parsed tool input) is a client-layer projection — server-side code reads the raw JSON from `arguments` directly.

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

const { messages, addToolOutput } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onToolCall: async ({ toolCall }) => {
    if (toolCall.toolName === 'showNotification') {
      showNotification(toolCall.input.message)
      // v6: addToolOutput (was addToolResult in v5)
      addToolOutput({
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
  description: 'Show a toast notification in the browser',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
})

// Client implementation
const showNotification = showNotificationDef.client(({ message }) => {
  toast(message)
  return { success: true }
})

// Use in component — `clientTools()` wires each client tool's `.client(...)`
// handler to run automatically when the server-side agent calls it; you don't
// need an onToolCall handler or an addToolOutput/addToolResult call.
const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: clientTools(showNotification),
})
```

### Tool Approval Flow

Both libraries expose first-class human-in-the-loop approval. The shapes are similar — a tool opts in with `needsApproval: true`, the client renders UI on an `approval-requested` state, and you call `addToolApprovalResponse` with the approval ID.

#### Before (Vercel AI SDK v6)

```typescript
// Tool definition (server)
import { tool } from 'ai'
const bookFlight = tool({
  description: 'Book a flight',
  inputSchema: z.object({ flightId: z.string() }),
  needsApproval: true, // v6: first-class approval
  execute: async ({ flightId }) => bookingService.book(flightId),
})

// Client
const { messages, addToolApprovalResponse } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
})
```

#### After (TanStack AI)

```typescript
// Built-in approval support
const bookFlightDef = toolDefinition({
  name: 'bookFlight',
  description: 'Book a flight on behalf of the user',
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

## Structured Output

This section covers the `generateObject` / `streamObject` / `Output.object(...)` migration path. In AI SDK v6, structured generation lives on `generateText` / `streamText` via the `output:` parameter (e.g. `Output.object({ schema })`). The dedicated `generateObject` / `streamObject` functions are deprecated but still present. TanStack AI follows the same "one function" philosophy — pass `outputSchema` to `chat()` and it runs the full agentic loop (tools, retries, loop strategy) and returns a typed, validated value.

### Before (Vercel AI SDK v6)

```typescript
import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const { output } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Extract the user profile from this bio…',
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number(),
      interests: z.array(z.string()),
    }),
  }),
})
// output is typed as { name: string; age: number; interests: string[] }
```

### After (TanStack AI)

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
// profile: { name: string; age: number; interests: string[] }
```

### Notes

- `outputSchema` accepts any **Standard Schema**-compatible library: **Zod v4.2+**, **ArkType v2.1.28+**, **Valibot v1.2+** (via `toStandardJsonSchema()`), or a plain JSON Schema object (which loses TS inference and falls back to `unknown`).
- When `outputSchema` is set, `chat()` always returns a `Promise<T>` — the `stream` flag is ignored, because the value only makes sense once the schema has validated the final output.
- Adapters implement structured output the best way for their provider: OpenAI uses `response_format: json_schema`, Anthropic uses tool-based extraction, Gemini uses `responseSchema`, Ollama uses JSON mode. You don't need to pick the strategy.
- Arrays are just `z.array(z.object({ … }))`. TanStack AI does not yet stream partial objects the way `streamObject().elementStream` does on the Vercel side — if that's load-bearing, stay on `streamText` for now and migrate the object case when partial streaming lands.

## Agent Loop Control

Both SDKs let the model call tools in a loop. The shape of the control knob is different:

| Vercel AI SDK v6 | TanStack AI |
|------------------|-------------|
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` |
| `stopWhen: hasToolCall('bookFlight')` | Custom `AgentLoopStrategy` that inspects `messages` for the tool name |
| `stopWhen: untilFinishReason(['stop'])` (custom condition) | `agentLoopStrategy: untilFinishReason(['stop'])` |
| `stopWhen: [stepCountIs(20), hasToolCall('done')]` | `agentLoopStrategy: combineStrategies([maxIterations(20), /* your hasToolCall */ ])` |
| `prepareStep({ stepNumber, messages, steps, model })` | `middleware.onConfig(ctx, config)` + `middleware.onIteration(ctx, info)` |

Default loop budget: TanStack AI defaults to `maxIterations(5)` if you don't pass a strategy.

### Before (Vercel AI SDK v6)

```typescript
import { streamText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: { getWeather },
  stopWhen: stepCountIs(10),
  prepareStep: async ({ stepNumber, messages }) => {
    // log/rewrite messages between steps, filter tools, etc.
    if (stepNumber > 0) return { /* partial config for this step */ }
    return {}
  },
})
```

### After (TanStack AI)

```typescript
import {
  chat,
  combineStrategies,
  maxIterations,
  untilFinishReason,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: [getWeather],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    untilFinishReason(['stop']), // stop when the model says it's done
  ]),
  middleware: [
    {
      // `prepareStep` analogue: inspect/rewrite config at the start of each iteration
      onConfig: (ctx, config) => {
        if (ctx.iteration > 0) {
          // e.g. return a Partial<ChatMiddlewareConfig> to filter tools, trim
          // messages, or change modelOptions for this iteration
          return { /* partial overrides */ }
        }
      },
    },
  ],
})
```

#### Mid-loop model switching

`prepareStep` in AI SDK v6 lets you return a different `model` per step. TanStack AI doesn't support swapping the adapter inside a single `chat()` run — `modelOptions` is typed per adapter, which is what gives you compile-time model safety. The equivalent is to end the current loop (via an `agentLoopStrategy`) and start a new `chat()` with a different adapter, feeding it the in-progress messages:

```typescript
// Stage 1: heavy model for the opening turn
const firstPass = await chat({
  adapter: openaiText('gpt-4o'),
  messages,
  agentLoopStrategy: maxIterations(1),
  stream: false,
})

// Stage 2: cheaper model for the rest
const followUp = chat({
  adapter: openaiText('gpt-4o-mini'),
  messages: [...messages, { role: 'assistant', content: firstPass }],
  tools: [getWeather],
})
```

## Middleware

AI SDK v6 has two middleware-ish extension points:

1. **`wrapLanguageModel({ model, middleware })`** — provider-level interception (`transformParams`, `wrapGenerate`, `wrapStream`) for logging, caching, guardrails, RAG.
2. **`experimental_transform`** on `streamText` — transforms the stream of chunks.

TanStack AI collapses both into a single first-class `middleware: ChatMiddleware[]` option on `chat()`. It hooks into the full lifecycle, not just the model call or the chunk stream, and is the recommended place for logging, tracing, caching, redaction, and tool interception.

### Before (Vercel AI SDK v6)

```typescript
import { wrapLanguageModel, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const loggingMiddleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    console.log('params', params)
    const result = await doGenerate()
    console.log('text', result.text)
    return result
  },
  wrapStream: async ({ doStream, params }) => doStream(),
  transformParams: async ({ params }) => params,
}

const wrapped = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: [loggingMiddleware],
})

const result = streamText({ model: wrapped, messages })
```

### After (TanStack AI)

```typescript
import { chat, type ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const loggingMiddleware: ChatMiddleware = {
  onStart: (ctx) => console.log('start', { requestId: ctx.requestId, model: ctx.model }),
  onConfig: (ctx, config) => console.log('config', config),
  onChunk:  (ctx, chunk) => { /* observe or transform; return null to drop */ },
  onUsage:  (ctx, usage) => console.log('usage', usage),
  onFinish: (ctx, info)  => console.log('finish', info),
  onError:  (ctx, err)   => console.error('error', err),
}

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  middleware: [loggingMiddleware],
  context: { userId: 'u_123' }, // passed to every hook as ctx.context
})
```

### Full hook inventory

Each middleware is a plain object. Every hook is optional, so pick what you need.

| Hook | Called when | Can transform? |
|------|-------------|----------------|
| `onStart(ctx)` | Chat run starts | — |
| `onConfig(ctx, config)` | Init + before each model call | Return `Partial<ChatMiddlewareConfig>` to mutate messages, systemPrompts, tools, temperature, etc. |
| `onIteration(ctx, info)` | Start of each agent-loop iteration | — |
| `onChunk(ctx, chunk)` | Every yielded `StreamChunk` | Return a chunk / array of chunks / `null` to drop |
| `onBeforeToolCall(ctx, hookCtx)` | Before a tool executes | Return a `BeforeToolCallDecision` to rewrite args, skip, or abort |
| `onAfterToolCall(ctx, info)` | After a tool executes (success or failure) | — |
| `onToolPhaseComplete(ctx, info)` | All tools in an iteration done | — |
| `onUsage(ctx, usage)` | Provider reports token usage | — |
| `onFinish(ctx, info)` | Run finished normally (terminal) | — |
| `onAbort(ctx, info)` | Run aborted (terminal) | — |
| `onError(ctx, info)` | Unhandled error (terminal) | — |

`ctx` carries `requestId`, `streamId`, `conversationId`, `iteration`, `model`, `provider`, `systemPrompts`, `toolNames`, `messages`, `context` (your opaque value), `abort(reason)`, `defer(promise)`, `createId(prefix)`, and more. See [the middleware guide](../advanced/middleware) for the full reference.

### Built-in: tool-call cache

TanStack AI ships a `toolCacheMiddleware` that memoizes tool results by `name + args`. There's no direct Vercel equivalent — on the Vercel side you'd compose it yourself in `wrapGenerate` or inside each tool's `execute`. Example:

```typescript
import { chat } from '@tanstack/ai'
import { toolCacheMiddleware } from '@tanstack/ai/middlewares'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  tools: [searchDocs, getWeather],
  middleware: [
    toolCacheMiddleware({
      maxSize: 100,
      ttl: 5 * 60_000, // 5 minutes
      toolNames: ['searchDocs'], // only cache these
      // storage: redisStorage, // plug in Redis / localStorage / custom
    }),
  ],
})
```

### Mapping common Vercel patterns to TanStack middleware

| Vercel pattern | TanStack middleware hook |
|----------------|--------------------------|
| `experimental_transform` (chunk transform) | `onChunk` |
| `experimental_repairToolCall` | `onBeforeToolCall` |
| `prepareStep` (dynamic model/tools/messages) | `onConfig` + `onIteration` |
| `wrapLanguageModel` logging | `onStart` + `onConfig` + `onFinish` |
| Custom caching in `wrapGenerate` | `toolCacheMiddleware` or your own `onBeforeToolCall`/`onAfterToolCall` |
| `experimental_telemetry` | Any terminal hook (`onFinish`/`onAbort`/`onError`) + your tracer |

## Observability (logging, metrics, tracing)

Both libraries leave the wire to your tracer of choice (OpenTelemetry, Sentry, Datadog, …). The plug point differs:

- **Vercel AI SDK**: `experimental_telemetry` on `streamText` + the lifecycle callbacks (`onChunk`, `onStepFinish`, `onFinish`, `onError`).
- **TanStack AI**: a middleware with the hooks you need. `onStart` + `onFinish`/`onAbort`/`onError` covers request-level spans; `onChunk` + `onUsage` gives you fine-grained timing; `onBeforeToolCall`/`onAfterToolCall` for tool spans.

Because `ctx.requestId` and `ctx.streamId` are stable across hooks, you get one trace per request without threading IDs manually.

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

// SSE response (recommended; pairs with fetchServerSentEvents on the client).
// Both response helpers accept a ResponseInit with an optional abortController
// — merge custom headers, status, or cancellation without unwrapping the helper.
return toServerSentEventsResponse(stream, {
  abortController,
  status: 200,
  headers: { 'X-Trace-Id': traceId },
})

// Newline-delimited JSON response (pairs with fetchHttpStream on the client).
return toHttpResponse(stream, { abortController })

// Or grab the raw ReadableStream if you need to pipe it somewhere else
// (writing to a Node ServerResponse, wrapping in a transform, etc.).
const sseStream = toServerSentEventsStream(stream, abortController)
const ndjsonStream = toHttpStream(stream, abortController)
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

// HTTP stream (matches toHttpResponse / toHttpStream on the server)
useChat({ connection: fetchHttpStream('/api/chat') })

// Custom adapter: return an AsyncIterable<StreamChunk>, e.g. from a TanStack
// Start server function or an RPC client
useChat({
  connection: stream((messages, data) => customServerFn({ messages, data })),
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
        { type: 'image', source: { type: 'url', value: imageUrl } },
        // Or inline base64 data
        { type: 'image', source: { type: 'data', value: imageData, mimeType: 'image/png' } },
      ],
    },
  ],
})
```

> The source discriminant is `'url'` or `'data'`. Both carry the payload on `value` (a URL or base64 string). `mimeType` is required for `'data'` and optional for `'url'`.

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

## Non-streaming Generation (`generateText`)

TanStack AI doesn't ship a separate `generateText` function — the same `chat()` covers both modes. Pass `stream: false` and the return type flips from `AsyncIterable<StreamChunk>` to `Promise<string>`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const text = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'Summarize TanStack AI in one sentence.' }],
  stream: false,
})
// text: string
```

If you already have a stream for another reason, `streamToText(stream)` collects it into a string:

```typescript
import { chat, streamToText } from '@tanstack/ai'

const stream = chat({ adapter: openaiText('gpt-4o'), messages })
const text = await streamToText(stream)
```

For structured (non-streaming) output — the `generateObject` equivalent — pass `outputSchema` instead; see [Structured Output](#structured-output).

## Features Not Yet Covered

A few AI SDK features don't have direct TanStack AI equivalents today:

### Embeddings

TanStack AI doesn't include embeddings. Use your provider's SDK directly, or the built-in embedding support most vector DBs already offer:

```typescript
import OpenAI from 'openai'

const openai = new OpenAI()
const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})
```

### Partial object streaming (`streamObject().elementStream` / `partialObjectStream`)

TanStack AI's `outputSchema` always returns a `Promise<T>` once the full response has validated. If you need to render partial JSON as it streams, stay on `streamText` + `onChunk` for that specific case (or parse from TanStack's raw stream with your own incremental JSON parser).

### Built-in retries and timeouts

Vercel's `maxRetries` / `timeout` options have no direct `chat()` equivalent. Use `AbortSignal.timeout(ms)` via `abortController`, and add retries in a custom middleware or in your fetch layer.

## Complete Migration Example

> On the Vercel side, the v5+ server handler runs incoming UI messages through `convertToModelMessages(messages)` before handing them to `streamText`. TanStack AI's `chat()` accepts the UI-message shape directly — its adapters do the conversion internally — so the equivalent line simply disappears on the After side.

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

If you hit something that isn't covered here, the deep-dive docs pick up where this guide stops:

1. [Quick Start](../getting-started/quick-start) — minimal working setup
2. [Tools](../tools/tools), [Tool Architecture](../tools/tool-architecture), and [Tool Approval](../tools/tool-approval) — the isomorphic tool system
3. [Agentic Cycle](../chat/agentic-cycle) — agent loop internals and strategy composition
4. [Structured Outputs](../chat/structured-outputs) — `outputSchema`, provider implementations, schema libraries
5. [Middleware](../advanced/middleware) — full hook reference, context object, built-in middleware
6. [Connection Adapters](../chat/connection-adapters) — SSE, HTTP stream, custom transports
7. [Per-Model Type Safety](../advanced/per-model-type-safety) — how `modelOptions` is typed
8. [API Reference](../api/ai) — every exported symbol
