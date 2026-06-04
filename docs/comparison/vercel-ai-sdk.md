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

Versions referenced below: TanStack AI as of this writing; Vercel AI SDK `ai@6.x` (v6.0.0 shipped December 2025, ESM-only).

| Feature | TanStack AI | Vercel AI SDK |
|---------|------------|---------------|
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere | Works anywhere |
| Providers | 9 official + community; OpenRouter routes to 100s of models and the `openaiCompatible` adapter connects to any OpenAI-compatible endpoint | 50+ direct provider packages; 100+ models via AI Gateway |
| Framework Hooks | React, Solid, Svelte, Vue, Preact (+ React Native) | React, Vue, Svelte, Solid, Angular |
| Streaming | Built-in with configurable chunk strategies | Built-in with progressive delivery |
| Tool Calling | Isomorphic `.server()` / `.client()` system | `tool()` objects; client execution via `onToolCall` |
| Agent Loop Control | Composable strategy functions `(state) => boolean` | `stopWhen` conditions + `Agent` (`ToolLoopAgent`) class |
| Tool Approval | Per-tool `needsApproval` with batched approval flow | Per-tool `needsApproval` (human-in-the-loop) |
| Type Safety | Per-model type narrowing | Per-provider types |
| Tree-Shaking | Separate adapter per activity (text, image, speech, etc.) | Monolithic provider packages |
| Lazy Tool Discovery | Built-in - token-optimized dynamic loading | - |
| Connection Adapters | SSE, HTTP stream, XHR (SSE/stream), RPC, direct async iterables, `fetcher`, custom | SSE-based data stream protocol (`ChatTransport`) |
| Middleware | App-level lifecycle hooks (config, iterations, chunks, tool calls, usage, errors) | Model-level wrapping via `wrapLanguageModel()` |
| Extend Adapter | Add custom/fine-tuned models with full type safety | - |
| Structured Outputs | Typed `StructuredOutputPart`, streamed alongside tools in one chat call | `generateObject()` / `streamObject()` / `Output` API |
| Image Generation | Stable API with per-model type safety (OpenAI, Gemini, Grok, OpenRouter, fal.ai) | `generateImage()` (stable) |
| Video Generation | Stable API with async job lifecycle (OpenAI, fal.ai) | `experimental_generateVideo()` |
| Text-to-Speech | Stable API, 6 output formats, speed control (OpenAI, Gemini, Grok, ElevenLabs, fal.ai) | `generateSpeech()` (experimental) |
| Transcription | Stable API with word timestamps and diarization (OpenAI, Grok, ElevenLabs, fal.ai) | `transcribe()` (experimental) |
| Audio / Music Generation | `generateAudio()` for music & sound effects (Gemini, ElevenLabs, fal.ai) | - |
| Summarization | Dedicated `summarize()` with streaming and style options | - |
| Code Execution | Node.js, Cloudflare Workers, QuickJS sandboxes | - |
| Realtime Voice | OpenAI, Grok, and ElevenLabs with VAD modes and tool support | - |
| DevTools | TanStack DevTools integration | `devToolsMiddleware` + local inspector |
| MCP Client | Provider-routed `mcpTool()` (no standalone client) | Built-in (`@ai-sdk/mcp`, stable) |
| Platform Association | None - pure library | Optional Vercel integration |

## Where TanStack AI Excels

### Per-Model Type Safety

When you select a provider and model, TypeScript narrows the exact options, capabilities, and input modalities available for that specific model - not a union of everything the provider supports.

Each provider adapter contains a comprehensive `model-meta.ts` that maps every model to its capabilities: supported input modalities, context windows, and provider-specific options. When you write `openaiText('gpt-5.5')`, the type system knows exactly what that model can do.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// TypeScript knows gpt-5.5 supports text + image input
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', content: 'What is in this image?' },
      { type: 'image', source: { type: 'url', url: 'https://example.com/photo.jpg' } },
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

Vercel AI SDK defines tools with a `tool()` helper and does support client-side execution - a tool with no `execute` function is handled in the browser via the UI hook's `onToolCall` callback, with the result returned through `addToolResult`. What it doesn't have is a single shared contract that produces separate `.server()` and `.client()` implementations: server and client tool code are declared independently rather than derived from one definition.

### Composable Agent Loop Strategies

TanStack AI provides agent loop control as composable pure functions. Each strategy is `(state) => boolean` - return `true` to continue, `false` to stop.

```ts
import { chat, maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.5'),
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

Vercel AI SDK (v5+) controls agent loops via `stopWhen`, which accepts composable stopping conditions like `stepCountIs(n)` and `hasToolCall(name)` (the default is `stepCountIs(20)`), and v6 adds a dedicated `Agent` abstraction (the `ToolLoopAgent` class) that bundles model, tools, instructions, and loop settings into a reusable object. The remaining difference is in the composition model: TanStack AI's strategies are arbitrary `(state) => boolean` predicates you write inline and combine with `combineStrategies`, so a stopping condition can encode any business logic (token budgets, cost ceilings, custom state checks) without waiting for a built-in condition to exist. Vercel's `stopWhen` also accepts custom functions, so the gap here is smaller than it once was.

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

`ChatClient` also accepts a persistence adapter (`ChatClientPersistence`) for saving and restoring conversations client-side, and a typed runtime `context` that flows through to tools and middleware.

### Connection Adapters

TanStack AI ships six built-in connection adapters plus a custom adapter interface:

```ts
import {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
} from '@tanstack/ai-client'

// Server-Sent Events (standard)
fetchServerSentEvents('/api/chat')

// Raw HTTP streaming (newline-delimited JSON)
fetchHttpStream('/api/chat')

// XHR-based SSE / HTTP streaming (React Native / Expo, where fetch streaming is unavailable)
xhrServerSentEvents('/api/chat')
xhrHttpStream('/api/chat')

// Direct async iterables (TanStack Start server functions)
stream((messages) => chatOnServer({ messages }))

// RPC-based transport
rpcStream((messages, data) => api.streamResponse(messages, data))

// Or implement your own ConnectionAdapter
```

Each adapter accepts static or dynamic (function-based) URLs and options. There's also a lighter-weight `fetcher` option on `ChatClient` / `useChat` for wiring a server function directly without a full adapter. Swap transport without changing application code. Vercel AI SDK centers on its SSE-based data stream protocol and a `ChatTransport` interface for extensibility, but doesn't ship the same breadth of built-in adapters - notably the XHR variants for React Native.

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
  adapter: openaiText('gpt-5.5'),
  messages,
  middleware: [logger],
})
```

The available hooks cover the full lifecycle:

| Hook | Purpose |
|------|---------|
| `onConfig` | Transform messages, tools, temperature, system prompts per iteration |
| `onStructuredOutputConfig` | Transform the structured-output schema/config before the call |
| `onStart` | Setup tasks (timers, logging) |
| `onIteration` | Observe each agent-loop iteration |
| `onChunk` | Transform, expand, or drop individual stream chunks |
| `onBeforeToolCall` | Intercept tool calls: transform args, skip execution, or abort the run |
| `onAfterToolCall` | Observe tool results, timing, and errors |
| `onToolPhaseComplete` | Observe the full batch of tool results for an iteration (e.g. aggregate approval state) |
| `onUsage` | Track token usage per iteration |
| `onFinish` / `onAbort` / `onError` | Terminal hooks (exactly one fires per run) |

Middleware compose naturally. `onConfig` pipes through each middleware in order. `onChunk` pipes chunks through each middleware (if one drops a chunk, later middleware never see it). `onBeforeToolCall` uses first-win semantics: the first middleware that returns a decision short-circuits the rest.

TanStack AI ships several built-in middleware. `toolCacheMiddleware` and `contentGuardMiddleware` come from the `@tanstack/ai/middlewares` subpath, and `otelMiddleware` from `@tanstack/ai/middlewares/otel` (kept on its own subpath so `@opentelemetry/api` stays an optional peer). `toolCacheMiddleware` caches tool results by name and arguments with configurable TTL, LRU eviction, and pluggable storage backends (Redis, localStorage, etc.).

```ts
import { toolCacheMiddleware, contentGuardMiddleware } from '@tanstack/ai/middlewares'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
```

Vercel AI SDK takes a different approach: `wrapLanguageModel()` wraps a model instance with middleware that can intercept and transform calls (and v6 adds `wrapEmbeddingModel()`). It ships several built-in middleware (`extractReasoningMiddleware`, `simulateStreamingMiddleware`, `defaultSettingsMiddleware`, and the new `devToolsMiddleware`), but these all operate at the model level rather than the application level. There's no equivalent to TanStack AI's tool call interception, chunk-level stream processing, or lifecycle hooks like `onBeforeToolCall` and `onAfterToolCall`.

### No Platform Association

TanStack AI is a pure library. There's no optional platform layer, no gateway abstraction, no hosting-specific features, and no deployment-specific optimizations. Your AI code carries no implicit association with any deployment platform.

This isn't just philosophical - it means no accidental dependencies on platform-specific features, no gateway abstractions that subtly encourage vendor adoption, and no marketing surface embedded in your technical stack.

### Code Execution Sandboxes

TanStack AI provides three isolate drivers for safe code execution in AI workflows:

- **`@tanstack/ai-isolate-node`** - Node.js sandbox via `isolated-vm`
- **`@tanstack/ai-isolate-cloudflare`** - Cloudflare Workers sandbox
- **`@tanstack/ai-isolate-quickjs`** - QuickJS lightweight sandbox

All three implement the same `IsolateDriver` interface, so you can swap execution environments without changing application code. This powers TanStack AI's code mode - where the LLM writes and executes code as part of the agent loop. A companion `@tanstack/ai-code-mode-skills` package lets you give code mode a persistent, reusable library of runtime skills.

Vercel AI SDK does not provide built-in code execution sandboxes (though some providers expose their own server-side code execution as provider-executed tools).

### Media Generation

TanStack AI provides stable, dedicated APIs for every media generation activity - image, video, speech, transcription, and summarization. Each is a separate, tree-shakeable function with its own adapter per provider.

Vercel AI SDK has added several of these capabilities. As of v6, `generateImage()` is stable; video generation is still experimental (`experimental_generateVideo()`); and `generateSpeech()` / `transcribe()` are exported without the `experimental_` prefix but are still documented as experimental features. TanStack AI's media APIs are stable across the board and go further in several areas:

**Image generation** - `generateImage()` with per-model type safety. TypeScript knows that `gpt-image-2` and `dall-e-3` expose different size constraints. Five providers ship adapters: OpenAI (GPT Image, DALL-E), Gemini (Imagen), Grok, OpenRouter, and fal.ai (600+ community models including Flux, SDXL, and more).

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A sunset over mountains',
  size: '1536x1024',
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

**Text-to-speech** - `generateSpeech()` supports 6 audio output formats (mp3, opus, aac, flac, wav, pcm), speed control (0.25x to 4x), and five providers: OpenAI (11 voices), Gemini (30+ voices with language hints), Grok, ElevenLabs, and fal.ai.

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

**Transcription** - `generateTranscription()` supports 5 output formats (json, text, srt, verbose_json, vtt), word-level timestamps with confidence scores, and four providers (OpenAI, Grok, ElevenLabs, fal.ai), with speaker diarization via OpenAI's `gpt-4o-transcribe-diarize` model.

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

**Audio & music generation** - `generateAudio()` generates music and sound effects across Gemini (Lyria), ElevenLabs (music + sound effects), and fal.ai. Vercel AI SDK has no equivalent.

**Summarization** - `summarize()` is a dedicated activity with style control (`bullet-points`, `paragraph`, `concise`), focus topics, and streaming support. Vercel AI SDK has no equivalent - summarization requires calling `generateText()` with a prompt.

**Realtime voice** - `realtimeToken()` enables bidirectional audio streaming with Voice Activity Detection modes (server, semantic, manual), tool calling during voice sessions, and simultaneous audio + text output. Three providers ship realtime adapters: OpenAI (Realtime API), Grok, and ElevenLabs. Vercel AI SDK has no realtime/bidirectional voice primitive - its audio support is batch-only (`generateSpeech` and `transcribe`).

All media activities follow the same adapter pattern as chat - tree-shakeable imports, per-model type safety, and streaming support. If your app only uses chat, none of this media code enters your bundle.

### Community Adapter Ecosystem

TanStack AI publishes an open adapter specification. The community has already built adapters for Decart, Cencori, Cloudflare, Soniox, and Mynth - with a [guide for building your own](../community-adapters/guide). The adapter interface is simple enough that adding a new provider is a focused, self-contained task.

## Where Vercel AI SDK Excels

**Provider breadth.** Vercel AI SDK ships 50+ first-party, individually typed provider packages. If you want a specific provider as a dedicated, maintained package without writing an adapter, their coverage is broader today. Raw model *count* is not the differentiator, though - TanStack AI's OpenRouter adapter reaches OpenRouter's full catalog (several hundred models), and the `openaiCompatible` adapter connects to any OpenAI-compatible endpoint.

**Angular support.** Vercel AI SDK has an official Angular integration. TanStack AI supports React, Solid, Svelte, Vue, and Preact, but not Angular. (Both ship Solid integrations, so Solid is not a differentiator.)

**MCP client.** Vercel AI SDK ships a stable, standalone Model Context Protocol client (`@ai-sdk/mcp`'s `createMCPClient`) that connects directly to MCP servers over HTTP, with OAuth, resource reading, and prompt templates. TanStack AI has no standalone client - it supports MCP through a provider-routed `mcpTool()` (OpenAI Responses API and Anthropic), where the provider, not your app, connects to the MCP server.

**Agent abstraction.** Vercel AI SDK v6 ships a dedicated `Agent` abstraction (the `ToolLoopAgent` class) that packages a model, tools, instructions, and loop settings into a reusable object with `.generate()` and `.stream()` methods, plus `InferAgentUIMessage` for end-to-end type safety. TanStack AI composes these pieces per call rather than offering a single agent class.

**AI Gateway.** Vercel's optional AI Gateway adds centralized provider management - failover routing, caching, and a single key across providers - integrated with the Vercel platform (and used by default when no provider is configured). TanStack AI ships no gateway of its own; for the same centralized routing across a large model catalog, it recommends its first-class OpenRouter adapter, with no platform association attached.

**React Server Components.** Vercel AI SDK has an RSC integration via `@ai-sdk/rsc` (`AIState`, `StreamableValue`, `streamUI`). Note that Vercel documents this as experimental and recommends AI SDK UI for production - so it's an option for Next.js RSC apps rather than the primary path.

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

**Vercel AI SDK** - Tool objects via the `tool()` helper:

```ts
import { generateText, tool } from 'ai'

const result = await generateText({
  model: openai('gpt-5.5'),
  tools: {
    getWeather: tool({
      description: 'Get current weather for a location',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        const data = await weatherApi.get(city)
        return { temp: data.temperature, condition: data.condition }
      },
    }),
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
  adapter: openaiText('gpt-5.5'),
  messages,
  tools,
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    untilFinishReason(['stop']),
    ({ iterationCount }) => estimatedTokens(iterationCount) < 50_000,
  ]),
})
```

**Vercel AI SDK** - `stopWhen` conditions (v5+):

```ts
import { generateText, stepCountIs } from 'ai'

const result = await generateText({
  model: openai('gpt-5.5'),
  tools,
  stopWhen: stepCountIs(10), // also: hasToolCall('name'), or a custom function
  prompt: 'Help me plan a trip.',
})
```

Both let you compose multiple stopping conditions - `stopWhen` accepts an array of conditions including custom functions, and v6 adds a reusable `Agent` class. The remaining nuance is ergonomic: TanStack AI's strategies are plain `(state) => boolean` predicates combined with `combineStrategies`, so token budgets and custom business logic are first-class without reaching for a built-in condition.

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
- **Preact or React Native** - One headless core covers React, Solid, Vue, Svelte, Preact, and React Native (via XHR adapters)
- **Isomorphic tools** - Define a tool once and derive `.server()` / `.client()` implementations from one contract
- **App-level middleware** - Lifecycle hooks for chunks, tool calls, usage, and errors - not just model wrapping
- **Realtime voice** - Bidirectional audio across OpenAI, Grok, and ElevenLabs
- **No vendor association** - Pure library with no platform layer
- **Per-model type safety** - TypeScript narrows options per model, not per provider
- **Code execution** - Built-in sandboxed execution environments
- **Flexible transport** - SSE, HTTP streams, XHR, RPC, direct iterables, or custom adapters

## When to Choose Vercel AI SDK

- **Need 50+ first-party provider packages** - Broader coverage of dedicated, individually typed provider packages today (TanStack reaches comparable model breadth via OpenRouter + `openaiCompatible`)
- **Angular support** - Official Angular integration
- **MCP client** - Stable, standalone MCP client (`@ai-sdk/mcp`) that connects to servers directly
- **Agent abstraction** - A reusable `Agent` (`ToolLoopAgent`) class with end-to-end UI message types
- **Vercel platform** - AI Gateway, observability, and deployment optimization
- **React Server Components** - RSC primitives via `@ai-sdk/rsc` (experimental; AI SDK UI is the recommended production path)

## Getting Started

```bash
npm install @tanstack/ai @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-openai
```

See the [Quick Start Guide](../getting-started/quick-start) to build your first chat application, or explore the [full documentation](../getting-started/overview).
