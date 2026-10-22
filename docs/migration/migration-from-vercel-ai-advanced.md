---
title: "Vercel AI SDK: full API mapping"
id: migration-from-vercel-ai-advanced
order: 3
description: "Each Vercel AI SDK API and its TanStack AI replacement: streamText options and results, useChat, tools, structured output, the agent loop, middleware, streaming, and embeddings."
keywords:
  - tanstack ai
  - vercel ai sdk
  - migration
  - streamText
  - generateText
  - generateObject
  - stopWhen
  - prepareStep
  - wrapLanguageModel
---

This page maps each Vercel AI SDK API to TanStack AI. For the short path (packages, server route, client, tools), start with [Migration from Vercel AI SDK](./migration-from-vercel-ai).

The "Before" samples are AI SDK v5 and v6 code. Where v4 is different, the page says so.

## `streamText` options

The options of `streamText` in AI SDK v6, and where each one goes in `chat()`. An option that both sides have keeps the same meaning, unless the notes say otherwise.

| `streamText` option | `chat()` equivalent | Notes |
|--------------------|--------------------|-------|
| `model: openai('gpt-4o')` | `adapter: openaiText('gpt-4o')` | The model id goes into an adapter function for one activity. |
| `prompt: 'Hello'` | `messages: [{ role: 'user', content: 'Hello' }]` | `chat()` takes messages only. |
| `messages` | `messages` | The content parts are different. See [Multimodal content](#multimodal-content). |
| `system: 'You are…'` | `systemPrompts: ['You are…']` | An array at the root. See [System prompts](#system-prompts). |
| `tools: { name: tool({…}) }` | `tools: [toolInstance, …]` | An array of tools, not an object with keys. |
| `toolChoice: 'auto' \| 'required' \| 'none' \| { type, toolName }` | `toolChoice: 'auto' \| 'required' \| 'none' \| { type: 'tool', name }` | `toolName` becomes `name`. See [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool). |
| `activeTools: string[]` | Filter `tools` yourself, or return a smaller `tools` array from `middleware.onConfig` | No dedicated option. See [Middleware](#middleware). |
| `temperature` | `modelOptions.temperature` | See [Model options](#model-options). |
| `maxOutputTokens` (`maxTokens` in v4), `topP` | `modelOptions`, with the key name of the provider | OpenAI: `max_output_tokens`, `top_p`. Anthropic: `max_tokens`, `top_p`. Gemini: `maxOutputTokens`, `topP`. |
| `topK`, `presencePenalty`, `frequencyPenalty`, `seed`, `stopSequences` | `modelOptions`, with the key name of the provider, if the provider has the option | `modelOptions` is typed for your model, so your editor shows the keys. |
| `maxRetries` | A retry `middleware`, or retries in your fetch layer | Not built into `chat()`. See [Retries and timeouts](#retries-and-timeouts). |
| `timeout` | `abortController` together with `AbortSignal.timeout(ms)` | Not built into `chat()`. |
| `abortSignal: controller.signal` | `abortController: controller` | Pass the controller, not the signal. |
| `headers` | `defaultHeaders` in the adapter config, for example `openaiText('gpt-4o', { defaultHeaders })`. For one call, use the `wrapFetch` option of `chat()`. | Not a plain option of `chat()`. |
| `providerOptions: { openai: { … } }` | `modelOptions: { … }` | Flat, because the adapter knows its provider. Typed for each model. |
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` | See [Agent loop control](#agent-loop-control). |
| `stopWhen: hasToolCall('x')` | A custom `AgentLoopStrategy` that reads `messages` | No built-in preset. See [Agent loop control](#agent-loop-control). |
| `stopWhen: [a, b]` | `agentLoopStrategy: combineStrategies([a, b])` | The loop stops when one of the strategies says stop. |
| `prepareStep` | `middleware` with `onConfig` and `onIteration` | See [Middleware](#middleware). |
| `experimental_transform` | `middleware.onChunk` | Change, drop, or add chunks. |
| `experimental_context` | `context` (at the root) | Typed runtime context for middleware hooks and tool implementations. |
| `experimental_telemetry` | `middleware` with your tracer | See [Observability](#observability). |
| `experimental_repairToolCall` | `middleware.onBeforeToolCall` | Return a decision that changes the args. |
| `experimental_download` | Prepare your `messages` before you call `chat()` | No built-in hook. |
| `onChunk` | `middleware.onChunk` | You can also read the chunks from the returned stream. |
| `onError` | `middleware.onError` | A terminal hook. |
| `onStepFinish` | `middleware.onIteration`, `onToolPhaseComplete`, or `onUsage` | Split into smaller hooks. |
| `onFinish` | `middleware.onFinish` | A terminal hook. |
| `onAbort` | `middleware.onAbort` | A terminal hook. |
| `output: Output.object({ schema })` | `outputSchema` | See [Structured output](#structured-output). |
| No equivalent | `threadId`, `runId` | TanStack AI only. They connect requests across your system and AG-UI. |

## `streamText` result

`streamText` returns an object with promises on it. `chat()` returns the stream itself. You get each value from the stream, from middleware, or from a response helper.

| `streamText` result member | TanStack AI equivalent |
|---------------------------|------------------------|
| `result.textStream` | Read the stream, and keep the `TEXT_MESSAGE_CONTENT` chunks: `if (chunk.type === 'TEXT_MESSAGE_CONTENT') chunk.delta` |
| `result.fullStream` | The stream that `chat()` returns is the full stream (`AsyncIterable<StreamChunk>`). |
| `result.text` | `(await streamToText(stream)).text`, or `(await chat({ …, stream: false })).text` |
| `result.content` | Collect the parts in `middleware.onChunk`, or read the final message in `onFinish`. |
| `result.toolCalls`, `result.toolResults` | Read them from the chunks in `middleware.onChunk` or `onAfterToolCall`, or from `chunks` on the `stream: false` result. |
| `result.usage`, `result.totalUsage` | `middleware.onUsage(ctx, usage)` |
| `result.finishReason` | `middleware.onFinish(ctx, info)` |
| `result.steps` | Collect them with `middleware.onIteration` and `onToolPhaseComplete`. |
| `result.toUIMessageStreamResponse()` | `toServerSentEventsResponse(stream)` |
| `result.toTextStreamResponse()` | Collect the text with `streamToText(stream)` and return a plain `Response`. Or use `toHttpResponse(stream)` with `fetchHttpStream` on the client. |
| `result.pipeUIMessageStreamToResponse(res)` | `toServerSentEventsStream(stream).pipeTo(…)` |
| `result.consumeStream()` | `for await (const _ of stream) {}` |

## Model options

Every provider-specific option, sampling included, goes in one typed `modelOptions` object. It has no `providerOptions: { openai: {…} }` nesting, because the adapter knows its provider. The keys are the keys of the provider API, typed for the model that you pass.

Before (Vercel AI SDK v5+):

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

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

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  // Provider options, typed for this model
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
    top_p: 0.9,
    service_tier: 'default',
    store: true,
    parallel_tool_calls: false,
  },
})
```

The keys in `modelOptions` follow the adapter and model that you pass. Change `openaiText('gpt-6.1-sol')` to `anthropicText('claude-sonnet-5-5')`, and the type changes to the Anthropic options. For the sampling key of each provider, see [Moving Sampling Options into modelOptions](./sampling-options-to-model-options#provider-key-reference).

## System prompts

Pass system prompts at the root, in the `systemPrompts` array. Each adapter merges them into the format of its provider. Do not add a `system` message to `messages`.

Before (Vercel AI SDK):

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const result = streamText({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  messages,
})
```

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: ['You are a helpful assistant.'],
  messages,
  threadId: 'thread-1',
})
```

You can pass more than one system prompt. Then you can keep the persona, the rules, and the tool guidance apart, with no string concatenation:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: [
    'You are a helpful assistant.',
    'Respond in concise, plain English.',
    'Never fabricate citations.',
  ],
  messages,
  threadId: 'thread-1',
})
```

Each item is a string, or an object with `content` and `metadata`.

## Messages

### Message parts

AI SDK v4 messages had a `content` string and `toolInvocations`. A TanStack AI `UIMessage` (what `useChat` gives you) has a `parts` array:

```typescript ignore
interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'activity'
  parts: Array<MessagePart>
  createdAt?: Date
}
```

The parts you render most often:

| Part | Shape |
| --- | --- |
| Text | `{ type: 'text', content }` |
| Thinking | `{ type: 'thinking', content }` |
| Tool call | `{ type: 'tool-call', id, name, arguments, input?, output?, state, approval? }` |
| Tool result | `{ type: 'tool-result', toolCallId, content, state, error? }` |

Other parts are:

- Media: image, audio, video, and document parts.
- Run parts: activity, structured output, UI resource, and subagent parts.

The `tool-call` part has these fields:

- `arguments` is the raw JSON string. It can be partial while it streams.
- `input` is the parsed input. It is typed when your tools are typed. Server code reads the raw JSON from `arguments`.
- `state` is `'awaiting-input'`, `'input-streaming'`, `'input-complete'`, `'approval-requested'`, or `'approval-responded'`.
- `approval` is `{ id, needsApproval, approved? }`. `approved` is `undefined` until the user answers.

The `tool-result` part has `state`: `'streaming'`, `'complete'`, or `'error'`. `error` is set when `state` is `'error'`.

TanStack AI has no `reasoning`, `source-url`, `source-document`, or `file` part types. Reasoning from the provider arrives as `thinking` parts.

### Render messages

Before (Vercel AI SDK v4):

```tsx ignore
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

After (TanStack AI):

```tsx ignore
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

## Tools

For server tools, see [Port your tools](./migration-from-vercel-ai#4-port-your-tools).

### Client tools

Before (Vercel AI SDK v5+):

```typescript
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'

const { messages, addToolOutput } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onToolCall: async ({ toolCall }) => {
    if (toolCall.toolName === 'showNotification') {
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

After (TanStack AI):

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { toast } from './toast'

// Define once. You can share the definition with the server.
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

// Pass the client tools in `tools`. When the agent on the server calls a
// tool, its `.client(...)` handler runs. You need no onToolCall handler and
// no addToolOutput or addToolResult call.
const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
  tools: [showNotification],
})
```

### Tool approval

Both libraries have a human-in-the-loop approval. In both, a tool asks for approval with `needsApproval: true`. In TanStack AI, the pending approval shows in the `interrupts` array of the hook. Call `resolveInterrupt` on that item with the decision.

Before (Vercel AI SDK v6):

```typescript
// Tool definition (server)
import { tool, DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { useChat } from '@ai-sdk/react'
import { z } from 'zod'
import { bookingService } from './booking'

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

After (TanStack AI):

```tsx ignore
// Built-in approval support
const bookFlightDef = toolDefinition({
  name: 'bookFlight',
  description: 'Book a flight on behalf of the user',
  inputSchema: z.object({ flightId: z.string() }),
  needsApproval: true, // Request user approval
})

// In the component. Pass the shared definition, so the approval item is typed.
const { messages, interrupts } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: [bookFlightDef],
})

// Render the approval UI from `interrupts`
{interrupts.map((interrupt) =>
  interrupt.kind === 'tool-approval' ? (
    <div key={interrupt.id}>
      <p>Approve booking flight {interrupt.originalArgs.flightId}?</p>
      <button onClick={() => interrupt.resolveInterrupt(true)}>Approve</button>
      <button onClick={() => interrupt.resolveInterrupt(false)}>Deny</button>
    </div>
  ) : null,
)}
```

`interrupt.originalArgs` is the parsed tool input. It is typed when you pass the tool in `tools`. For a full approval screen, see [Tool Approval](../interrupts/tool-approval).

## Structured output

In AI SDK v6, structured output is the `output:` option of `generateText` and `streamText` (for example `Output.object({ schema })`). The `generateObject` and `streamObject` functions are deprecated, but they still exist.

TanStack AI also uses one function. Pass `outputSchema` to `chat()`. It runs the full agent loop (tools, retries, loop strategy) and returns a typed, validated value.

Before (Vercel AI SDK v6):

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

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const profile = await chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Extract the user profile from this bio…' }],
  threadId: 'thread-1',
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
    interests: z.array(z.string()),
  }),
})
// profile: { name: string; age: number; interests: string[] }
```

- **Schema libraries.** `outputSchema` takes any Standard Schema library: Zod v4.2+, ArkType v2.1.28+, or Valibot v1.2+ (with `toStandardJsonSchema()`). It also takes a plain JSON Schema object, but then the result type is `unknown`.
- **The return type.** With `outputSchema` and no `stream: true`, `chat()` returns a `Promise<T>`. The value is ready when the schema validates the final output.
- **Arrays.** Use `z.array(z.object({ … }))`.
- **The provider method.** Each adapter uses the structured output method of its provider. You do not pick it. For example, OpenAI uses a JSON schema format, Gemini uses `responseSchema`, and Anthropic uses a forced tool (or its native JSON schema output when you also pass tools).

### Stream a partial object

The equivalent of `streamObject()` and its `partialObjectStream` is `chat({ outputSchema, stream: true })`. It returns a stream:

- The raw JSON arrives as `TEXT_MESSAGE_CONTENT` deltas.
- The stream ends with a `structured-output.complete` event that holds the validated object.

On the client, `useChat({ outputSchema })` gives you `partial` (the object so far) and `final` (the validated object). See [Streaming Structured Output UIs](../structured-outputs/streaming).

## Agent loop control

Both libraries let the model call tools in a loop. The control is different:

| Vercel AI SDK v6 | TanStack AI |
|------------------|-------------|
| `stopWhen: stepCountIs(5)` | `agentLoopStrategy: maxIterations(5)` |
| `stopWhen: hasToolCall('bookFlight')` | A custom `AgentLoopStrategy` that looks for the tool name in `messages` |
| `stopWhen: untilFinishReason(['stop'])` (custom condition) | `agentLoopStrategy: untilFinishReason(['stop'])` |
| `stopWhen: [stepCountIs(20), hasToolCall('done')]` | `agentLoopStrategy: combineStrategies([maxIterations(20), yourHasToolCall])` |
| `prepareStep({ stepNumber, messages, steps, model })` | `middleware.onConfig(ctx, config)` and `middleware.onIteration(ctx, info)` |

If you pass no strategy, `chat()` uses `combineStrategies([maxIterations(5), untilFinishReason(['length'])])`.

`combineStrategies` continues only while every strategy returns `true`. So the loop stops when one strategy says stop.

A strategy is a function that gets the loop state and returns `true` to continue. This one stops after the model calls `bookFlight`:

```typescript
import type { AgentLoopStrategy } from '@tanstack/ai'

const untilBooked: AgentLoopStrategy = ({ messages }) =>
  !messages.some((message) =>
    message.toolCalls?.some((call) => call.function.name === 'bookFlight'),
  )
```

Before (Vercel AI SDK v6):

```typescript
import { streamText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getWeather } from './tools'

const messages = [{ role: 'user' as const, content: 'What is the weather?' }]

const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools: { getWeather },
  stopWhen: stepCountIs(10),
  prepareStep: async ({ stepNumber, messages: stepMessages }) => {
    // log/rewrite messages between steps, filter tools, etc.
    if (stepNumber > 0) return {}
    return {}
  },
})
```

After (TanStack AI):

```typescript
import {
  chat,
  combineStrategies,
  maxIterations,
  untilFinishReason,
  toServerSentEventsResponse,
  type ChatMiddleware,
  type ChatMiddlewareContext,
  type ChatMiddlewareConfig,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { getWeather } from './tools'

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [getWeather],
    agentLoopStrategy: combineStrategies([
      maxIterations(10),
      untilFinishReason(['stop']), // stop when the model ends with 'stop'
    ]),
    middleware: [
      {
        // Like `prepareStep`: read or change the config at the start of each iteration
        onConfig: (ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) => {
          if (ctx.iteration > 0) {
            // Return a Partial<ChatMiddlewareConfig> to filter tools, trim
            // messages, or change modelOptions for this iteration
            return undefined
          }
        },
      } satisfies ChatMiddleware,
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

### Switch models in the loop

In AI SDK v6, `prepareStep` can return a different `model` for each step. TanStack AI cannot change the adapter inside one `chat()` run, because `modelOptions` is typed for one adapter. That type gives you model safety at compile time.

Instead, end the loop with an `agentLoopStrategy`. Then start a new `chat()` with a different adapter, and give it the messages so far:

```typescript
import { chat, maxIterations } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { getWeather } from './tools'

const messages = [{ role: 'user' as const, content: 'Hello' }]

// Stage 1: a large model for the first turn
const firstPass = await chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  agentLoopStrategy: maxIterations(1),
  stream: false,
})

// Stage 2: a smaller model for the rest
const followUp = chat({
  adapter: anthropicText('claude-haiku-5-5'),
  messages: [...messages, { role: 'assistant' as const, content: firstPass.text }],
  threadId: 'thread-1',
  tools: [getWeather],
})
```

## Middleware

AI SDK v6 has two extension points of this kind:

- **`wrapLanguageModel({ model, middleware })`** works at the provider level (`transformParams`, `wrapGenerate`, `wrapStream`). You use it for logging, caching, guardrails, and RAG.
- **`experimental_transform`** on `streamText` changes the stream of chunks.

TanStack AI has one `middleware: ChatMiddleware[]` option on `chat()` for both. Its hooks cover the full run: the model call, the chunks, the tool calls, and the end of the run. Use it for logging, tracing, caching, redaction, and tool interception.

Before (Vercel AI SDK v6):

```typescript
import { wrapLanguageModel, streamText, type LanguageModelMiddleware } from 'ai'
import { openai } from '@ai-sdk/openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const loggingMiddleware = {
  specificationVersion: 'v3' as const,
  wrapGenerate: async ({ doGenerate, params }) => {
    console.log('params', params)
    const result = await doGenerate()
    console.log('content', result.content)
    return result
  },
  wrapStream: async ({ doStream, params }) => doStream(),
  transformParams: async ({ params }) => params,
} satisfies LanguageModelMiddleware

const wrapped = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: [loggingMiddleware],
})

const result = streamText({ model: wrapped, messages })
```

After (TanStack AI):

```typescript
import { chat, toServerSentEventsResponse, type ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

type AppContext = { userId: string }

const loggingMiddleware: ChatMiddleware<AppContext> = {
  onStart: (ctx) => console.log('start', { requestId: ctx.requestId, userId: ctx.context.userId }),
  onConfig: (ctx, config) => console.log('config', config),
  onChunk:  (ctx, chunk) => { /* read or change the chunk; return null to drop it */ },
  onUsage:  (ctx, usage) => console.log('usage', usage),
  onFinish: (ctx, info)  => console.log('finish', info),
  onError:  (ctx, err)   => console.error('error', err),
}

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    middleware: [loggingMiddleware],
    context: { userId: 'u_123' }, // each hook gets it as the typed ctx.context
  })
  return toServerSentEventsResponse(stream)
}
```

### Hooks

A middleware is a plain object. Each hook is optional.

| Hook | Runs when | Can change the run? |
|------|-------------|----------------|
| `onStart(ctx)` | The chat run starts | No |
| `onConfig(ctx, config)` | At the start, and before each model call | Return a `Partial<ChatMiddlewareConfig>` to change messages, system prompts, tools, model options, and more |
| `onIteration(ctx, info)` | Each agent-loop iteration starts | No |
| `onChunk(ctx, chunk)` | Each `StreamChunk` is yielded | Return a chunk, an array of chunks, or `null` to drop it |
| `onBeforeToolCall(ctx, hookCtx)` | Before a tool runs | Return a `BeforeToolCallDecision` to change the args, skip the call, or abort |
| `onAfterToolCall(ctx, info)` | After a tool runs (success or failure) | Return an `AfterToolCallDecision` |
| `onToolPhaseComplete(ctx, info)` | All tools of an iteration are done | No |
| `onUsage(ctx, usage)` | The provider reports token usage | No |
| `onFinish(ctx, info)` | The run finishes normally (terminal) | No |
| `onAbort(ctx, info)` | The run is aborted (terminal) | No |
| `onError(ctx, info)` | An error is not handled (terminal) | No |

There are more hooks, for example `onShouldContinue` and `onModelError`. See [the middleware guide](../advanced/middleware).

`ctx` has these fields:

- The ids: `requestId`, `streamId`, and `threadId`.
- The run state: `iteration`, `model`, `provider`, `systemPrompts`, `toolNames`, and `messages`.
- `context`: your typed runtime value.
- The helpers: `abort(reason)`, `defer(promise)`, and `createId(prefix)`.

For the full reference, see [the middleware guide](../advanced/middleware) and [Runtime Context](../advanced/runtime-context).

### Tool-call cache

TanStack AI ships `toolCacheMiddleware`. It keeps tool results by tool name and args. The Vercel AI SDK has no direct equivalent. There, you write the cache yourself in `wrapGenerate` or in the `execute` of each tool.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { toolCacheMiddleware } from '@tanstack/ai/middlewares'
import { openaiText } from '@tanstack/ai-openai'
import { searchDocs, getWeather } from './tools'

export async function POST(request: Request) {
  const { messages, threadId } = await request.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    tools: [searchDocs, getWeather],
    middleware: [
      toolCacheMiddleware({
        maxSize: 100,
        ttl: 5 * 60_000, // 5 minutes
        toolNames: ['searchDocs'], // cache only these tools
        // storage: redisStorage, // Redis, localStorage, or your own store
      }),
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

### Map Vercel patterns to middleware

| Vercel pattern | TanStack middleware hook |
|----------------|--------------------------|
| `experimental_transform` (change chunks) | `onChunk` |
| `experimental_repairToolCall` | `onBeforeToolCall` |
| `prepareStep` (change the model, tools, or messages) | `onConfig` and `onIteration` |
| Logging with `wrapLanguageModel` | `onStart`, `onConfig`, and `onFinish` |
| A cache in `wrapGenerate` | `toolCacheMiddleware`, or your own `onBeforeToolCall` and `onAfterToolCall` |
| `experimental_telemetry` | A terminal hook (`onFinish`, `onAbort`, or `onError`) with your tracer |

## Observability

Both libraries send traces to the tracer that you pick (OpenTelemetry, Sentry, Datadog, and more). The connection point is different:

- **Vercel AI SDK:** `experimental_telemetry` on `streamText`, and the callbacks `onChunk`, `onStepFinish`, `onFinish`, and `onError`.
- **TanStack AI:** a middleware with the hooks that you need:
  - `onStart` with `onFinish`, `onAbort`, or `onError` for a span for each request.
  - `onChunk` and `onUsage` for detailed timing.
  - `onBeforeToolCall` and `onAfterToolCall` for tool spans.

`ctx.requestId` and `ctx.streamId` stay the same across hooks. So you get one trace for each request, and you do not pass ids by hand. For a ready-made tracer, see [OpenTelemetry](../advanced/otel).

## Provider adapters

Each provider package exports one adapter function for each activity.

| Vercel AI SDK | TanStack AI |
| --- | --- |
| `openai('gpt-4o')` in `streamText` | `openaiText('gpt-4o')` in `chat` |
| `openai.embedding('text-embedding-3-small')` in `embed` | `openaiEmbedding('text-embedding-3-small')` in `embed` |
| `openai.image('dall-e-3')` in `generateImage` | `openaiImage('dall-e-3')` in `generateImage` |
| `anthropic('<model>')` | `anthropicText('<model>')` |
| `google('<model>')` | `geminiText('<model>')` |

For text to speech, use `generateSpeech({ adapter: openaiSpeech('tts-1'), ... })`.

```typescript ignore
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'

chat({ adapter: anthropicText('claude-sonnet-5-5'), messages })
chat({ adapter: geminiText('gemini-3.8-flash'), messages })
```

`anthropicText` and `geminiText` take model ids from their own model lists. Dated ids such as `claude-sonnet-4-5-20250514` are not in the Anthropic list.

## Streaming responses

### Server response formats

Before (Vercel AI SDK v5+):

```typescript ignore
// UI message stream (default, for useChat)
return result.toUIMessageStreamResponse()

// Plain text stream
return result.toTextStreamResponse()
```

After (TanStack AI):

```typescript
import {
  chat,
  toServerSentEventsResponse,
  toServerSentEventsStream,
  toHttpResponse,
  toHttpStream,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const abortController = new AbortController()
const traceId = 'trace-123'
const messages = [{ role: 'user' as const, content: 'Hello' }]

async function handler() {
  const stream = chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId: 'thread-1' })

  // SSE response. Use it with fetchServerSentEvents on the client.
  // Both response helpers take a ResponseInit with an optional abortController,
  // so you can add headers, a status, or cancellation.
  return toServerSentEventsResponse(stream, {
    abortController,
    status: 200,
    headers: { 'X-Trace-Id': traceId },
  })
}

async function handler2() {
  const stream = chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId: 'thread-1' })

  // Newline-delimited JSON response. Use it with fetchHttpStream on the client.
  return toHttpResponse(stream, { abortController })
}

// Or get the raw ReadableStream, to pipe it somewhere else
// (for example a Node ServerResponse, or a transform).
const stream2 = chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId: 'thread-1' })
const sseStream = toServerSentEventsStream(stream2, abortController)
const ndjsonStream = toHttpStream(stream2, abortController)
```

### Client connection adapters

Before (Vercel AI SDK v5+):

```typescript
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'

useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})
```

After (TanStack AI):

```typescript
import { useChat, fetchServerSentEvents, fetchHttpStream, stream } from '@tanstack/ai-react'
import { customServerFn } from './server'

// SSE (use with toServerSentEventsResponse)
useChat({ connection: fetchServerSentEvents('/api/chat'), threadId: 'support-chat' })

// HTTP stream (use with toHttpResponse or toHttpStream on the server)
useChat({ connection: fetchHttpStream('/api/chat'), threadId: 'support-chat' })

// Custom adapter: return an AsyncIterable<StreamChunk>, for example from a
// TanStack Start server function or an RPC client
useChat({
  connection: stream((_messages, _data, _signal, input) => customServerFn(input)),
  threadId: 'support-chat',
})
```

For more transports, see [Transports](../transports/overview).

## Cancellation

`chat()` takes an `AbortController`, not a signal. Then helpers like `toServerSentEventsStream` can connect the cancellation to the response stream for you.

Before (Vercel AI SDK):

```typescript ignore
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  abortSignal: controller.signal,
})
```

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const abortController = new AbortController()

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  abortController,
})

// Cancel the stream
abortController.abort()
```

## Client callbacks

Before (Vercel AI SDK v5+):

```typescript
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'

const { messages } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onFinish: ({ message }) => console.log('Finished:', message),
  onError: (error) => console.error('Error:', error),
})
```

After (TanStack AI):

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
  onResponse: (response) => console.log('Response started'),
  onChunk: (chunk) => console.log('Chunk received:', chunk),
  onFinish: (message) => console.log('Finished:', message),
  onError: (error) => console.error('Error:', error),
})
```

On the server, you can also read the stream that `chat()` returns. It has the full typed `StreamChunk` union. Use it for logs, analytics, or extra SSE events next to the response.

## Multimodal content

Before (Vercel AI SDK):

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { imageUrl } from './images'

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

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { imageUrl, imageData } from './images'

chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'Describe this image' },
        { type: 'image', source: { type: 'url', value: imageUrl } },
        // Or inline base64 data
        { type: 'image', source: { type: 'data', value: imageData, mimeType: 'image/png' } },
      ],
    },
  ],
  threadId: 'thread-1',
})
```

The text part uses `content`, not `text`. The `source.type` is `'url'` or `'data'`, and both carry the URL or the base64 string in `value`. `mimeType` is required for `'data'` and optional for `'url'`. See [Multimodal Content](../advanced/multimodal-content).

## Switch providers at runtime

Before (Vercel AI SDK):

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const providers = {
  openai: openai('gpt-4o'),
  anthropic: anthropic('claude-sonnet-4-5-20250514'),
}

const selectedProvider: keyof typeof providers = 'openai'

streamText({
  model: providers[selectedProvider],
  messages,
})
```

After (TanStack AI):

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const adapters = {
  openai: () => openaiText('gpt-6.1-sol'),
  anthropic: () => anthropicText('claude-sonnet-5-5'),
} as const

const selectedProvider: keyof typeof adapters = 'openai'

chat({
  adapter: adapters[selectedProvider](),
  messages,
  threadId: 'thread-1',
})
```

For more, see [Runtime Adapter Switching](../advanced/runtime-adapter-switching).

## Type safety

### Typed message parts

```typescript
import { createChatClientOptions, type InferChatMessages } from '@tanstack/ai-client'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { updateUI, saveData } from './tools'

const tools = [updateUI, saveData]

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'thread-1',
  tools,
})

// Infer fully typed messages
type ChatMessages = InferChatMessages<typeof chatOptions>

// Now TypeScript knows:
// - the exact tool names
// - the input type of each tool
// - the output type of each tool
```

### Per-model options

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const adapter = openaiText('gpt-6.1-sol')

chat({
  adapter,
  messages,
  threadId: 'thread-1',
  modelOptions: {
    // TypeScript autocompletes the options of this model
    service_tier: 'default',
    store: true,
  },
})
```

See [Per-Model Type Safety](../advanced/per-model-type-safety).

## Non-streaming generation (`generateText`)

TanStack AI has no separate `generateText` function. `chat()` does both. Pass `stream: false`, and the return type changes from `AsyncIterable<StreamChunk>` to `Promise<ChatResult>`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const { text, chunks } = await chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Summarize TanStack AI in one sentence.' }],
  threadId: 'thread-1',
  stream: false,
})
// text: string
// chunks: every chunk of the run (tool calls, usage, RUN_FINISHED)
```

If you already have a stream, `streamToText(stream)` reads it to the end. It returns the same `{ text, chunks }` result:

```typescript
import { chat, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]
const stream = chat({ adapter: openaiText('gpt-6.1-sol'), messages, threadId: 'thread-1' })
const { text } = await streamToText(stream)
```

For structured output with no stream (the `generateObject` equivalent), pass `outputSchema`. See [Structured output](#structured-output).

## Embeddings

Vercel `embed` and `embedMany` both map to one TanStack AI function, `embed()`. `input` takes one item or an array. The result always has one vector for each input item.

Before (Vercel AI SDK):

```typescript
import { embed, embedMany } from 'ai'
import { openai } from '@ai-sdk/openai'

const { embedding } = await embed({
  model: openai.embedding('text-embedding-3-small'),
  value: 'Hello, world!',
})

const { embeddings } = await embedMany({
  model: openai.embedding('text-embedding-3-small'),
  values: ['one', 'two'],
})
```

After (TanStack AI):

```typescript
import { embed } from '@tanstack/ai'
import { openaiEmbedding } from '@tanstack/ai-openai'

const single = await embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: 'Hello, world!',
})
const vector = single.embeddings[0]?.vector

const batch = await embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: ['one', 'two'],
})
const vectors = batch.embeddings.map((e) => e.vector)
```

`embed()` also takes multimodal input (text and image) for models like Cohere embed-v4.0 and Amazon Titan Multimodal. See the [Embeddings guide](../embeddings.md).

## Retries and timeouts

The Vercel `maxRetries` and `timeout` options have no direct `chat()` equivalent:

- **Timeout.** Pass an `abortController`, and abort it with `AbortSignal.timeout(ms)` or a timer.
- **Retries.** Add them in a custom middleware, or in your fetch layer.
