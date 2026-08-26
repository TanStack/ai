---
title: TanStack AI vs Vercel AI SDK
id: vercel-ai-sdk
order: 1
description: "Feature matrix and philosophy: TanStack AI vs Vercel AI SDK — types, tools, streaming, frameworks."
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

If you need to pick an SDK → scan the matrix, then jump to “When to choose” at the bottom. Trying TanStack → [Quick Start](../getting-started/quick-start).

Both are open-source TypeScript toolkits (streaming chat, tools, multi-provider). **TanStack AI** is library composition (import adapters/tools/transport/UI; no platform layer). **Vercel AI SDK** is a broader full-stack surface with optional platform/gateway integration.

Versions: TanStack AI as of this writing; Vercel AI SDK `ai@6.x` (v6 Dec 2025; v7 pre-release at writing).

## Feature matrix

| Feature | TanStack AI | Vercel AI SDK |
|---------|------------|---------------|
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere | Works anywhere |
| Providers | 9 official + community; OpenRouter → 100s of models; `openaiCompatible` for any OpenAI-compatible endpoint | ~38 first-party packages (+ community); 100+ models via AI Gateway |
| Framework Hooks | React, Solid, Svelte, Vue, Preact (+ React Native) | React, Vue, Svelte, Angular (Solid community-maintained) |
| Generation UI Hooks | One hook per activity: chat, structured output, image, audio, speech, transcription, summarize, video, realtime | `useChat`, `useCompletion`, `useObject` |
| Wire Protocol | Native AG-UI events end to end | Proprietary UI Message Stream; AG-UI via external translation |
| Streaming | Built-in, configurable chunk strategies | Built-in progressive delivery |
| Tool Calling | Isomorphic `.server()` / `.client()` | `tool()`; client via `onToolCall` |
| Agent Loop Control | `(state) => boolean` strategies + `combineStrategies` | `stopWhen` + `Agent` (`ToolLoopAgent`) |
| Tool Approval | Per-tool `needsApproval`, batched | Per-tool `needsApproval` |
| Type Safety | Per-model narrowing | Per-provider types |
| Tree-Shaking | Separate adapter per activity | Monolithic provider packages |
| Lazy Tool Discovery | Built-in, every provider | Anthropic-only tool search + `deferLoading` |
| Connection Adapters | SSE, HTTP stream, XHR, RPC, async iterables, `fetcher`, custom | SSE data stream (`ChatTransport`) |
| Middleware | App-level lifecycle hooks | Model wrap via `wrapLanguageModel()` |
| Extend Adapter | Custom models + per-model type narrowing | `customProvider()` / registry (string ids) |
| Structured Outputs | Typed `StructuredOutputPart` in message history | `generateObject` / `streamObject` / `Output` (per-call) |
| Image / Video / TTS / Transcription | Stable APIs; video async job lifecycle; multi-provider | `generateImage` stable; video/speech/transcribe experimental or batch-only |
| Audio / Music | `generateAudio()` | — |
| Summarization | Dedicated `summarize()` | — (prompt `generateText`) |
| Code Execution | Node / Cloudflare / QuickJS isolates you run | Provider-hosted code tools |
| Code Mode Skills | LLM-writable skill library | — |
| Coding Agent Sandboxes | Grok Build, Claude Code, Codex, OpenCode + any ACP via `acpCompatible`; local/Docker/Daytona/Vercel/Sprites/CF | `HarnessAgent` (experimental); centered on Vercel Sandbox |
| Realtime Voice | OpenAI, Grok, ElevenLabs | — |
| DevTools | In-app panel, all frameworks | Server-side inspector + middleware |
| MCP Client | `@tanstack/ai-mcp` + provider-routed `mcpTool()` | `@ai-sdk/mcp` |
| MCP Apps | React + Preact + agnostic bridge; multi-server | React experimental renderer |
| Platform Association | None | Optional Vercel integration |

## Where TanStack AI excels

### Per-model type safety

Selecting a model narrows options, modalities, and capabilities for **that** model (from adapter `model-meta.ts`), not a provider union.

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
      { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } },
    ],
  }],
})
```

Image part on a text-only model → compile error.

### Tree-shakeable adapters

Each activity is a separate import. Chat-only apps do not bundle image/speech code.

```ts ignore
// Only chat code is bundled - nothing else
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// vs. importing activities you actually need
import { chat, generateImage } from '@tanstack/ai'
import { openaiText, openaiImage } from '@tanstack/ai-openai'
```

### Isomorphic tools

One contract; `.server()` / `.client()` implementations. Shared Zod validation; compile-time `ServerTool` vs `ClientTool`.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { db } from './db'

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

Vercel: `tool()` + browser `onToolCall` / `addToolOutput` when there is no `execute`. No single definition that yields both `.server()` and `.client()`.

### Agent loop strategies

Continue/stop as `(state) => boolean`; AND via `combineStrategies`.

```ts
import { chat, maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { tools } from './tools'

const messages = [{ role: 'user' as const, content: 'Help me plan a trip.' }]

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

Custom predicates inline:

```ts
import { maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { estimatedCost, budget } from './cost'

combineStrategies([
  maxIterations(10),
  untilFinishReason(['stop']),
  // Custom: stop if budget exceeded
  ({ iterationCount }) => estimatedCost(iterationCount) < budget,
])
```

Vercel: `stopWhen` (`stepCountIs`, `hasToolCall`, custom fns) + v6 `ToolLoopAgent`. Custom stop fns exist on both sides; TanStack treats arbitrary predicates as first-class.

### Lazy tool discovery

`lazy: true` tools stay off the initial prompt; a synthetic discovery tool loads schemas on demand (all providers).

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

Vercel v6: Anthropic tool search + `deferLoading` only (provider-hosted).

### MCP

**Two paths (mixable in one `chat()`)**

1. Host-side: `@tanstack/ai-mcp` — `createMCPClient` / `createMCPClients`, HTTP/SSE/stdio, OAuth
2. Provider-routed: `mcpTool()` — provider connects (OpenAI Responses, Anthropic)

**Host-side extras:** managed lifecycle via `mcp` on `chat()`, multi-server pools + prefixes, typed allowlists/codegen CLI, lazy discovery, resources/prompts helpers.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'What tools are available?' }]

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})

// chat() discovers the tools and closes the client when the run ends
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: { clients: [mcp] },
})
```

Vercel `@ai-sdk/mcp` covers host-side HTTP/SSE, OAuth, resources, prompts. TanStack adds pools, codegen types, lazy discovery, managed lifecycle, and `mcpTool()`.

### MCP Apps (widgets)

Both implement [MCP Apps](https://modelcontextprotocol.io) (`ui://` sandboxed widgets). TanStack differences:

1. React + Preact renderers; bridge in framework-agnostic `@tanstack/ai-client`
2. Multi-server routing via `serverId` + same-server tool checks
3. Stateless reconnect by default; pluggable `McpSessionStore` for stateful transports

```tsx
import { useChat, useMcpAppBridge } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  // Routes widget tool-calls to /api/mcp-apps/call by serverId; only http/https/mailto links pass through.
  const bridge = useMcpAppBridge({
    threadId: 'weather-chat',
    callEndpoint: '/api/mcp-apps/call',
    chat: { sendMessage: async (content) => void sendMessage({ content }) },
    onLink: (url) => window.open(url, '_blank', 'noopener'),
  })

  return (
    <>
      {messages.map((m) =>
        m.parts.map((part, i) =>
          part.type === 'ui-resource' ? (
            <MCPAppResource
              key={i}
              part={part}
              bridge={bridge}
              sandbox={{ url: new URL('https://your-app.example.com/mcp-sandbox.html') }}
            />
          ) : null,
        ),
      )}
    </>
  )
}
```

Vercel: `experimental_MCPAppRenderer` (React only) + `splitMCPAppTools` (model-visible vs app-only). Full API: [MCP Apps guide](../mcp/apps).

### Headless client

`ChatClient` owns streaming, messages, tools, approvals, connections. Framework packages are thin wrappers: React/Solid/Vue/Preact `useChat`, Svelte `createChat`. Persistence adapter + typed runtime `context` supported.

### Connection adapters

```ts
import {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  rpcStream,
} from '@tanstack/ai-client'
import { chatOnServer } from './server'
import { api } from './api'

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

Static or dynamic URLs/options. Lighter `fetcher` option on `ChatClient` / `useChat` for server functions without a full adapter. Vercel centers on SSE data stream + `ChatTransport`; fewer built-ins (no XHR RN pair).

### Extend adapter

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

Vercel: `customProvider()` / `createProviderRegistry()` with string model ids — registration without the same literal-type narrowing.

### Middleware

App-level hooks across config, chunks, tools, usage, finish/abort/error:

```ts
import { chat, EventType, type ChatMiddleware, type StreamChunk } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const logger: ChatMiddleware = {
  name: 'logger',
  onStart: (ctx) => {
    console.log(`[${ctx.requestId}] Chat started`)
  },
  onChunk: (ctx, chunk) => {
    // Transform, expand, or drop chunks. `type` is the discriminant, so it
    // narrows `chunk` to the matching event and types `delta` as `string`.
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      return { ...chunk, delta: chunk.delta.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]') }
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

| Hook | Purpose |
|------|---------|
| `onConfig` | Transform messages, tools, temperature, system per iteration |
| `onStructuredOutputConfig` | Transform structured-output schema/config |
| `onStart` / `onIteration` | Setup; observe agent-loop iterations |
| `onChunk` | Transform/expand/drop stream chunks |
| `onBeforeToolCall` / `onAfterToolCall` / `onToolPhaseComplete` | Intercept tools; observe batches |
| `onUsage` / `onFinish` / `onAbort` / `onError` | Usage + terminals |

Compose: `onConfig`/`onChunk` pipe; `onBeforeToolCall` first-win short-circuit.

Built-ins: `toolCacheMiddleware`, `contentGuardMiddleware` from `@tanstack/ai/middlewares`; `otelMiddleware` from `@tanstack/ai/middlewares/otel`.

```ts
import { toolCacheMiddleware, contentGuardMiddleware } from '@tanstack/ai/middlewares'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
```

Vercel: model-level `wrapLanguageModel()` (+ `wrapEmbeddingModel` in v6), built-in middleware, and per-call experimental callbacks — not a single app-lifecycle middleware object model.

### No platform association

Pure library: no gateway, hosting-specific features, or deployment coupling.

### Code execution sandboxes

| Package | Runtime |
| --- | --- |
| `@tanstack/ai-isolate-node` | Node via `isolated-vm` |
| `@tanstack/ai-isolate-cloudflare` | Cloudflare Workers |
| `@tanstack/ai-isolate-quickjs` | QuickJS |

Same `IsolateDriver` interface. Powers code mode + `@tanstack/ai-code-mode-skills` (LLM-writable persistent skills). Vercel has no first-party isolate drivers (provider-hosted tools only).

### Coding agent sandboxes

Run Claude Code / Codex / Grok Build / OpenCode / any ACP agent in a sandbox; stream via `chat()` middleware.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { defineSandbox, defineWorkspace, githubRepo, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { messages, threadId } from './chat-context'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'TanStack/ai' }),
    packageManager: 'pnpm',
  }),
})

const stream = chat({
  threadId,
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

**Axes:** any ACP agent via `acpCompatible`; providers (local, Docker, Daytona, Vercel, Sprites, Cloudflare) with `capabilities()`. Vercel `HarnessAgent` (experimental) is narrower (fixed harness list; Vercel Sandbox–centered).

### Media generation

Stable, tree-shakeable APIs: image, video (async job + poll), speech (6 formats), transcription, `generateAudio()`, `summarize()`, realtime voice. Vercel: image stable; video/speech/transcribe experimental or no realtime/summarize/music equivalents.

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

```ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioFile } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('gpt-4o-transcribe'),
  audio: audioFile,
  responseFormat: 'verbose_json', // Includes word-level timestamps
})

// result.words → [{ word: 'Hello', start: 0.0, end: 0.42 }, ...]
```

### Native AG-UI

Wire format is AG-UI (`@ag-ui/core`) end to end. Vercel uses proprietary UI Message Stream; AG-UI needs `@ag-ui/vercel-ai-sdk`.

### Hooks for every activity

`useGeneration`, `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`, `useTranscription`, `useSummarize`, `useGenerateVideo`, `useRealtimeChat` — same connection/devtools story as `useChat` across frameworks. Vercel UI: `useChat` / `useCompletion` / `useObject`; media is server-side only.

### Multi-turn structured output

`outputSchema` on `useChat` → typed `StructuredOutputPart` per turn (partial → final) in history. Vercel structured APIs are per-call results without a structured message part in the union.

### Debug logging

`debug: true` with per-category toggles + pluggable logger. Vercel: warnings + experimental telemetry / dev inspector.

### Community adapters

Open adapter spec; community adapters (e.g. Decart, Cencori, Cloudflare, Soniox, Mynth). Guide: [build your own](../community-adapters/guide).

## Where Vercel AI SDK excels

**Provider packages.** ~38 first-party typed packages. TanStack reaches large model counts via OpenRouter + `openaiCompatible`, not the same package count.

**Angular.** Official Vercel Angular integration; TanStack has React/Solid/Svelte/Vue/Preact (no Angular). Solid flips the other way: TanStack official; AI SDK Solid is community/older major.

**Agent class.** v6 `ToolLoopAgent` packages model/tools/instructions/loop. TanStack composes per call.

**AI Gateway.** Centralized failover/caching/keys on Vercel. TanStack recommends OpenRouter for multi-model routing without a platform layer.

**RSC.** `@ai-sdk/rsc` (experimental; Vercel recommends AI SDK UI for production).

## Side-by-side snippets

### Tool definition

**TanStack**

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { weatherApi } from './weather'

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

**Vercel**

```ts
import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { weatherApi } from './weather'

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

### Agent loop

**TanStack**

```ts
import { chat, combineStrategies, maxIterations, untilFinishReason } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { tools } from './tools'
import { estimatedTokens } from './cost'

const messages = [{ role: 'user' as const, content: 'Help me plan a trip.' }]

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

**Vercel**

```ts
import { generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { tools } from './tools'

const result = await generateText({
  model: openai('gpt-5.5'),
  tools,
  stopWhen: stepCountIs(10), // also: hasToolCall('name'), or a custom function
  prompt: 'Help me plan a trip.',
})
```

### Tree-shaking

```ts
// TanStack — only chat + OpenAI text
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
```

```ts
// Vercel — provider package includes model surface
import { openai } from '@ai-sdk/openai'
```

## When to choose TanStack AI

- Bundle size / tree-shakeable activity adapters
- Native AG-UI wire protocol
- Solid, Preact, or React Native (XHR adapters) with official support
- Hooks beyond chat (image, summarize, video, realtime, …)
- Isomorphic tools + app-level middleware
- Realtime voice, code/coding-agent sandboxes, flexible transport, dual MCP paths

## When to choose Vercel AI SDK

- First-party package for a specific niche provider (~38 packages)
- Official Angular
- Reusable `ToolLoopAgent` + UI message types
- Vercel AI Gateway / platform observability
- RSC primitives via `@ai-sdk/rsc` (experimental)

## Start with TanStack

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-openai

<!-- ::end:tabs -->

- [Quick Start](../getting-started/quick-start)
- [Overview](../getting-started/overview)
