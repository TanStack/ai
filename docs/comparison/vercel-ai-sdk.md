---
title: TanStack AI vs Vercel AI SDK
id: vercel-ai-sdk
order: 1
description: "How TanStack AI compares to the Vercel AI SDK — feature matrix, philosophy, type safety, tool calling, streaming, and framework support."
keywords:
  - tanstack ai
  - vercel ai sdk
  - comparison
  - ai sdk
  - alternatives
  - typescript ai sdk
  - tool calling
  - llm
---

Both TanStack AI and Vercel AI SDK are open-source TypeScript toolkits for building AI-powered applications. They share common ground - streaming chat, tool calling, multi-provider support, and deploy-anywhere flexibility - but they approach the problem from fundamentally different directions.

TanStack AI treats AI as a **library composition problem**. Every piece - adapters, tools, agent loops, transport, UI - is a composable building block. You import what you need, compose it how you want, and ship it wherever you want. No platform layer, no gateway abstraction, no implicit associations.

Vercel AI SDK treats AI as a **full-stack platform problem**. It provides a broad surface area of primitives with optional platform integration for gateway routing, observability, and deployment optimization.

This article compares the two SDKs from TanStack AI's perspective, with honest acknowledgment of where each excels.

## Feature Comparison

| Feature | TanStack AI | Vercel AI SDK |
|---------|------------|---------------|
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere | Works anywhere |
| Providers | 9 official (including OpenRouter) + 5 community | 40+ via Gateway or direct |
| Framework Hooks | React, Solid, Svelte, Vue, Preact | React, Svelte, Vue, Angular |
| Streaming | Built-in with configurable chunk strategies | Built-in with progressive delivery |
| Tool Calling | Isomorphic `.server()` / `.client()` system | Provider-scoped tool objects |
| Agent Loop Control | Composable strategy functions | `maxSteps` parameter |
| Tool Approval | Per-tool `needsApproval` with batched approval flow | Per-tool approval |
| Type Safety | Per-model type narrowing | Per-provider types |
| Tree-Shaking | Separate adapter per activity (text, image, speech, etc.) | Monolithic provider packages |
| Lazy Tool Discovery | Built-in - token-optimized dynamic loading | - |
| Connection Adapters | SSE, HTTP stream, RPC, direct async iterables, custom | SSE-based transport |
| Middleware | Lifecycle hooks: config, chunks, tool calls, usage, errors | Model wrapping via `wrapLanguageModel()` |
| Extend Adapter | Add custom/fine-tuned models with full type safety | - |
| Image Generation | Stable API with per-model type safety (OpenAI, Gemini, fal.ai) | `generateImage()` |
| Video Generation | Stable API with async job lifecycle (OpenAI, fal.ai) | `experimental_generateVideo()` |
| Text-to-Speech | Stable API, 6 output formats, speed control (OpenAI, Gemini, ElevenLabs) | `experimental_generateSpeech()` |
| Transcription | Stable API with word timestamps and diarization (OpenAI) | `experimental_transcribe()` |
| Summarization | Dedicated `summarize()` with streaming and style options | - |
| Code Execution | Node.js, Cloudflare Workers, QuickJS sandboxes | - |
| Realtime Voice | OpenAI Realtime API with VAD modes and tool support | - |
| DevTools | TanStack DevTools integration | Local dev inspector |
| MCP Client | - | Built-in |
| Platform Association | None - pure library | Optional Vercel integration |

## Where TanStack AI Excels

### Per-Model Type Safety

When you select a provider and model, TypeScript narrows the exact options, capabilities, and input modalities available for that specific model - not a union of everything the provider supports.

Each provider adapter contains a comprehensive `model-meta.ts` that maps every model to its capabilities: supported input modalities, context windows, and provider-specific options. When you write `openaiText('gpt-5.2')`, the type system knows exactly what that model can do.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// TypeScript knows gpt-5.2 supports text + image input
const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', url: 'https://example.com/photo.jpg' },
    ],
  }],
})
```

If you pass an image content part to a text-only model, TypeScript catches it at compile time.

### Tree-Shakeable Adapters

Every AI activity - chat, summarization, image generation, speech, transcription, video - is a separate import. Every provider exposes separate adapter functions per activity. If your app only uses chat, image generation code never enters your bundle.

```ts
// Only chat code is bundled - nothing else
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// vs. importing activities you actually need
import { chat, generateImage } from '@tanstack/ai'
import { openaiText, openaiImage } from '@tanstack/ai-openai'
```

This is architectural, not incidental. Each adapter implements a specific interface (`TextAdapter`, `ImageAdapter`, `TTSAdapter`, etc.) and lives in its own module. Modern bundlers eliminate everything you don't import.

### Isomorphic Tools

`toolDefinition()` creates a shared contract - name, description, input schema, output schema - that can be implemented for different runtimes. `.server()` adds a server-side implementation with access to databases and APIs. `.client()` adds a client-side implementation that runs in the browser.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Define once - shared validation contract
const addToCartDef = toolDefinition({
  name: 'addToCart',
  description: 'Add an item to the shopping cart',
  inputSchema: z.object({
    itemId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
  }),
})

// Server implementation - database access
const addToCartServer = addToCartDef.server(async ({ itemId, quantity }) => {
  const cart = await db.carts.addItem(itemId, quantity)
  return { success: true, cartId: cart.id }
})

// Client implementation - runs in the browser
const addToCartClient = addToCartDef.client(async ({ itemId, quantity }) => {
  const res = await fetch(`/api/cart`, {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  })
  return res.json()
})
```

The same schema validates inputs and outputs on both sides. The type system tracks whether a tool is a `ServerTool` or `ClientTool` at compile time.

Vercel AI SDK supports extracting tools via a `tool()` helper for reuse, but there's no shared definition that bridges server and client - tools don't have separate `.server()` and `.client()` implementations from a single contract.

### Composable Agent Loop Strategies

TanStack AI provides agent loop control as composable pure functions. Each strategy is `(state) => boolean` - return `true` to continue, `false` to stop.

```ts
import { chat, maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  tools,
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    untilFinishReason(['stop', 'length']),
  ]),
})
```

`combineStrategies` composes them with AND logic - all strategies must agree to continue. You can add custom strategies alongside built-in ones:

```ts
combineStrategies([
  maxIterations(10),
  untilFinishReason(['stop']),
  // Custom: stop if budget exceeded
  ({ iterationCount }) => estimatedCost(iterationCount) < budget,
])
```

Vercel AI SDK controls agent loops via the `maxSteps` parameter on `generateText()` and `streamText()`. You can set a step limit, but it doesn't offer a composable strategy pattern for combining multiple stopping conditions.

### Lazy Tool Discovery

When your application has dozens of tools, sending all their schemas to the LLM on every request wastes tokens. TanStack AI solves this with lazy tool discovery.

Mark tools as `lazy: true` and they won't be sent to the LLM initially. Instead, a synthetic discovery tool is injected that lets the LLM request tool schemas on demand:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const searchProducts = toolDefinition({
  name: 'searchProducts',
  description: 'Search the product catalog',
  lazy: true, // Not sent to LLM initially
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})
```

The LLM sees a lightweight `__lazy__tool__discovery__` tool listing available tool names. When it needs one, it calls the discovery tool to get the full schema, then uses the real tool. For applications with large tool inventories, this significantly reduces per-request token costs.

Vercel AI SDK has no equivalent - all tools must be sent upfront.

### Headless Client Architecture

`ChatClient` is a framework-agnostic class that manages the entire chat lifecycle - streaming, message state, tool execution, approval flows, and connection management. Every framework integration wraps this single client:

- `@tanstack/ai-react` - `useChat` hook wraps `ChatClient`
- `@tanstack/ai-solid` - `useChat` hook wraps `ChatClient`
- `@tanstack/ai-vue` - `useChat` composable wraps `ChatClient`
- `@tanstack/ai-svelte` - `createChat` wraps `ChatClient` (Svelte 5 runes)
- `@tanstack/ai-preact` - `useChat` hook wraps `ChatClient`

No framework-specific logic in the core. If a new framework emerges, it only needs a thin reactive wrapper.

### Connection Adapters

TanStack AI ships four built-in connection adapters plus a custom adapter interface:

```ts
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  rpcStream,
} from '@tanstack/ai-client'

// Server-Sent Events (standard)
fetchServerSentEvents('/api/chat')

// Raw HTTP streaming (newline-delimited JSON)
fetchHttpStream('/api/chat')

// Direct async iterables (TanStack Start server functions)
stream((messages) => chatOnServer({ messages }))

// RPC-based transport
rpcStream((messages, data) => api.streamResponse(messages, data))

// Or implement your own ConnectConnectionAdapter
```

Each adapter accepts static or dynamic (function-based) URLs and options. Swap transport without changing application code. Vercel AI SDK primarily uses SSE-based transport and provides extensibility via a transport interface, but doesn't ship the same breadth of built-in adapters.

### Extend Adapter

When you use fine-tuned models, OpenAI-compatible proxies, or custom model endpoints, `extendAdapter()` lets you add them to any provider adapter with full type safety:

```ts
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const customModels = [
  createModel('my-fine-tuned-gpt4', ['text', 'image']),
  createModel('company-internal-llm', ['text']),
] as const

const myOpenai = extendAdapter(openaiText, customModels)

// Full autocomplete - original models + custom models
const adapter = myOpenai('my-fine-tuned-gpt4')
```

Your custom models appear in autocomplete alongside official ones. Vercel AI SDK has no equivalent pattern.

### Middleware

TanStack AI's middleware system hooks into every stage of the `chat()` lifecycle: configuration, streaming, tool execution, usage tracking, and completion. Each middleware is a plain object with named hooks that fire at specific phases.

```ts
import { chat, type ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const logger: ChatMiddleware = {
  name: 'logger',
  onStart: (ctx) => {
    console.log(`[${ctx.requestId}] Chat started`)
  },
  onChunk: (ctx, chunk) => {
    // Transform, expand, or drop chunks
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      return {
        ...chunk,
        delta: chunk.delta.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]'),
      }
    }
  },
  onBeforeToolCall: (ctx, hookCtx) => {
    // Intercept tool calls: transform args, skip, or abort
    if (hookCtx.toolName === 'deleteDatabase') {
      return { type: 'abort', reason: 'Dangerous operation blocked' }
    }
  },
  onAfterToolCall: (ctx, info) => {
    console.log(`${info.toolName}: ${info.ok ? 'success' : 'failed'} in ${info.duration}ms`)
  },
  onFinish: (ctx, info) => {
    console.log(`Done in ${info.duration}ms, ${info.usage?.totalTokens} tokens`)
  },
}

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  middleware: [logger],
})
```

The available hooks cover the full lifecycle:

| Hook | Purpose |
|------|---------|
| `onConfig` | Transform messages, tools, temperature, system prompts per iteration |
| `onStart` | Setup tasks (timers, logging) |
| `onChunk` | Transform, expand, or drop individual stream chunks |
| `onBeforeToolCall` | Intercept tool calls: transform args, skip execution, or abort the run |
| `onAfterToolCall` | Observe tool results, timing, and errors |
| `onUsage` | Track token usage per iteration |
| `onFinish` / `onAbort` / `onError` | Terminal hooks (exactly one fires per run) |

Middleware compose naturally. `onConfig` pipes through each middleware in order. `onChunk` pipes chunks through each middleware (if one drops a chunk, later middleware never see it). `onBeforeToolCall` uses first-win semantics: the first middleware that returns a decision short-circuits the rest.

TanStack AI also ships `toolCacheMiddleware` built-in, which caches tool results by name and arguments with configurable TTL, LRU eviction, and pluggable storage backends (Redis, localStorage, etc.).

Vercel AI SDK takes a different approach: `wrapLanguageModel()` wraps a model instance with middleware that can intercept and transform calls. It ships several built-in middleware (`extractReasoningMiddleware`, `simulateStreamingMiddleware`, `defaultSettingsMiddleware`), but these operate at the model level rather than the application level. There's no equivalent to TanStack AI's tool call interception, chunk-level stream processing, or lifecycle hooks like `onBeforeToolCall` and `onAfterToolCall`.

### No Platform Association

TanStack AI is a pure library. There's no optional platform layer, no gateway abstraction, no hosting-specific features, and no deployment-specific optimizations. Your AI code carries no implicit association with any deployment platform.

This isn't just philosophical - it means no accidental dependencies on platform-specific features, no gateway abstractions that subtly encourage vendor adoption, and no marketing surface embedded in your technical stack.

### Code Execution Sandboxes

TanStack AI provides three isolate drivers for safe code execution in AI workflows:

- **`@tanstack/ai-isolate-node`** - Node.js sandbox via `isolated-vm`
- **`@tanstack/ai-isolate-cloudflare`** - Cloudflare Workers sandbox
- **`@tanstack/ai-isolate-quickjs`** - QuickJS lightweight sandbox

All three implement the same `IsolateDriver` interface, so you can swap execution environments without changing application code. This powers TanStack AI's code mode - where the LLM writes and executes code as part of the agent loop.

Vercel AI SDK does not provide built-in code execution sandboxes.

### Media Generation

TanStack AI provides stable, dedicated APIs for every media generation activity - image, video, speech, transcription, and summarization. Each is a separate, tree-shakeable function with its own adapter per provider.

Vercel AI SDK has added some of these capabilities, but most remain experimental (`experimental_generateSpeech`, `experimental_generateVideo`, `experimental_transcribe`). TanStack AI's media APIs are stable and go further in several areas:

**Image generation** - `generateImage()` with per-model type safety. TypeScript knows that `dall-e-3` supports `1024x1024`, `1792x1024`, and `1024x1792`, while `gpt-image-1` has different size constraints. Three providers ship adapters: OpenAI (DALL-E, GPT Image), Gemini (Imagen 3), and fal.ai (600+ community models including Flux, SDXL, and more).

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A sunset over mountains',
  size: '1792x1024',
  numberOfImages: 1,
})
```

**Video generation** - `generateVideo()` handles the full async job lifecycle automatically. Video generation APIs are inherently asynchronous - you submit a job, poll for status, and eventually get a result. TanStack AI manages this entire lifecycle with configurable polling intervals and timeouts, streaming status updates back to the client.

```ts
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const stream = generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat playing piano',
  size: '1280x720',
  duration: 8,
  stream: true,          // Stream job lifecycle events
  pollingInterval: 2000, // Poll every 2 seconds
})

for await (const chunk of stream) {
  // Receive: job created → status updates → final video URL
}
```

Vercel AI SDK's `experimental_generateVideo()` returns the video directly without exposing the job lifecycle or streaming status updates.

**Text-to-speech** - `generateSpeech()` supports 6 audio output formats (mp3, opus, aac, flac, wav, pcm), speed control (0.25x to 4x), and multiple providers: OpenAI (11 voices), Gemini (30+ voices with language hints), and ElevenLabs.

```ts
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1-hd'),
  text: 'Hello, world!',
  voice: 'nova',
  format: 'opus',
  speed: 1.2,
})
```

**Transcription** - `generateTranscription()` supports 5 output formats (json, text, srt, verbose_json, vtt), word-level timestamps with confidence scores, and speaker diarization via OpenAI's `gpt-4o-transcribe-diarize` model.

```ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await generateTranscription({
  adapter: openaiTranscription('gpt-4o-transcribe'),
  audio: audioFile,
  responseFormat: 'verbose_json', // Includes word-level timestamps
})

// result.words → [{ word: 'Hello', start: 0.0, end: 0.42 }, ...]
```

**Summarization** - `summarize()` is a dedicated activity with style control (`bullet-points`, `paragraph`, `concise`), focus topics, and streaming support. Vercel AI SDK has no equivalent - summarization requires calling `generateText()` with a prompt.

**Realtime voice** - `realtimeToken()` enables bidirectional audio streaming via OpenAI's Realtime API with Voice Activity Detection modes (server, semantic, manual), tool calling during voice sessions, and simultaneous audio + text output.

All media activities follow the same adapter pattern as chat - tree-shakeable imports, per-model type safety, and streaming support. If your app only uses chat, none of this media code enters your bundle.

### Community Adapter Ecosystem

TanStack AI publishes an open adapter specification. The community has already built adapters for Decart, Cencori, Cloudflare, Soniox, and Mynth - with a [guide for building your own](../community-adapters/guide). The adapter interface is simple enough that adding a new provider is a focused, self-contained task.

## Where Vercel AI SDK Excels

**Provider breadth.** Vercel AI SDK ships 40+ provider packages - from major platforms to niche providers. If you need immediate access to a specific provider without writing an adapter, their coverage is broader today.

**Angular support.** Vercel AI SDK has an official Angular integration. TanStack AI supports React, Solid, Svelte, Vue, and Preact, but not Angular.

**MCP client.** Vercel AI SDK includes a built-in Model Context Protocol client for connecting to MCP servers. TanStack AI does not currently ship one.

**AI Gateway.** For teams that want centralized provider management with failover routing and caching, Vercel's optional AI Gateway provides this out of the box.

**React Server Components.** Vercel AI SDK has deep integration with React Server Components via `@ai-sdk/rsc`, including `AIState` and `StreamableValue` primitives optimized for Next.js.

## Side-by-Side: Key Differences

### Tool Definition

**TanStack AI** - Isomorphic definitions with separate runtime implementations:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get current weather for a location',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temp: z.number(), condition: z.string() }),
})

// Server implementation
const getWeatherServer = getWeather.server(async ({ city }) => {
  const data = await weatherApi.get(city)
  return { temp: data.temperature, condition: data.condition }
})

// Client implementation
const getWeatherClient = getWeather.client(async ({ city }) => {
  const res = await fetch(`/api/weather?city=${city}`)
  return res.json()
})
```

**Vercel AI SDK** - Inline tool objects:

```ts
import { generateText } from 'ai'

const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    getWeather: {
      description: 'Get current weather for a location',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        const data = await weatherApi.get(city)
        return { temp: data.temperature, condition: data.condition }
      },
    },
  },
  prompt: "What's the weather in Tokyo?",
})
```

The TanStack approach separates the tool contract from its implementation, making tools reusable across server and client contexts.

### Agent Loop Control

**TanStack AI** - Composable strategies:

```ts
import { chat, combineStrategies, maxIterations, untilFinishReason } from '@tanstack/ai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  tools,
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    untilFinishReason(['stop']),
    ({ iterationCount }) => estimatedTokens(iterationCount) < 50_000,
  ]),
})
```

**Vercel AI SDK** - Step limit parameter:

```ts
import { generateText } from 'ai'

const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  maxSteps: 10,
  prompt: 'Help me plan a trip.',
})
```

TanStack AI's approach lets you compose multiple conditions - iteration limits, finish reasons, token budgets, custom business logic - as simple functions. Vercel AI SDK's `maxSteps` provides a straightforward step limit but doesn't offer a composable strategy pattern.

### Tree-Shaking

**TanStack AI** - Separate adapters per activity:

```ts
// Only bundles chat + OpenAI text adapter
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
```

**Vercel AI SDK** - Single provider import:

```ts
// Provider package includes all model types
import { openai } from '@ai-sdk/openai'
```

In TanStack AI, each activity (chat, image, speech, video, transcription, summarization) is a separate adapter function. You import `openaiText` for chat and `openaiImage` for image generation - they're independent modules. Vercel AI SDK's provider packages are more monolithic.

## When to Choose TanStack AI

- **Bundle size matters** - Tree-shakeable adapters per activity mean smaller bundles
- **Multi-framework team** - React, Solid, Vue, Svelte, Preact from one headless core
- **Custom agent behavior** - Composable loop strategies, not a fixed agent class
- **No vendor association** - Pure library with no platform layer
- **Per-model type safety** - TypeScript narrows options per model, not per provider
- **Code execution** - Built-in sandboxed execution environments
- **Flexible transport** - SSE, HTTP streams, RPC, direct iterables, or custom adapters

## When to Choose Vercel AI SDK

- **Need 40+ providers immediately** - Broader provider coverage today
- **Angular support** - Official Angular integration
- **MCP client** - Built-in Model Context Protocol support
- **Vercel platform** - AI Gateway, observability, and deployment optimization
- **React Server Components** - Deep RSC integration via `@ai-sdk/rsc`

## Getting Started

```bash
npm install @tanstack/ai @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-openai
```

See the [Quick Start Guide](../getting-started/quick-start) to build your first chat application, or explore the [full documentation](../getting-started/overview).
