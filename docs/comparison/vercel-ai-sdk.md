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

Versions referenced below: TanStack AI as of this writing; Vercel AI SDK `ai@6.x` (v6.0.0 shipped December 2025; v7 is in pre-release at the time of writing).

| Feature | TanStack AI | Vercel AI SDK |
|---------|------------|---------------|
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere | Works anywhere |
| Providers | 9 official + community; OpenRouter routes to 100s of models and the `openaiCompatible` adapter connects to any OpenAI-compatible endpoint | ~38 first-party provider packages (plus community providers); 100+ models via AI Gateway |
| Framework Hooks | React, Solid, Svelte, Vue, Preact (+ React Native) | React, Vue, Svelte, Angular (Solid is community-maintained) |
| Generation UI Hooks | One hook per activity: chat, structured output, image, audio, speech, transcription, summarize, video, realtime | `useChat`, `useCompletion`, `useObject` |
| Wire Protocol | Native AG-UI events end to end | Proprietary UI Message Stream; AG-UI via external translation layer |
| Streaming | Built-in with configurable chunk strategies | Built-in with progressive delivery |
| Tool Calling | Isomorphic `.server()` / `.client()` system | `tool()` objects; client execution via `onToolCall` |
| Agent Loop Control | Composable strategy functions `(state) => boolean` | `stopWhen` conditions + `Agent` (`ToolLoopAgent`) class |
| Tool Approval | Per-tool `needsApproval` with batched approval flow | Per-tool `needsApproval` (human-in-the-loop) |
| Type Safety | Per-model type narrowing | Per-provider types |
| Tree-Shaking | Separate adapter per activity (text, image, speech, etc.) | Monolithic provider packages |
| Lazy Tool Discovery | Built-in - works across every provider | Anthropic-only tool search with `deferLoading` (provider-hosted) |
| Connection Adapters | SSE, HTTP stream, XHR (SSE/stream), RPC, direct async iterables, `fetcher`, custom | SSE-based data stream protocol (`ChatTransport`) |
| Middleware | App-level lifecycle hooks (config, iterations, chunks, tool calls, usage, errors) | Model-level wrapping via `wrapLanguageModel()` |
| Extend Adapter | Add custom/fine-tuned models with per-model type narrowing | `customProvider()` / `createProviderRegistry()` (string model ids) |
| Structured Outputs | Typed `StructuredOutputPart`, streamed alongside tools and preserved per turn in message history | `generateObject()` / `streamObject()` / `Output` API (per-call; no structured-output message part) |
| Image Generation | Stable API with per-model type safety (OpenAI, Gemini, Grok, OpenRouter, fal.ai) | `generateImage()` (stable) |
| Video Generation | Stable API with async job lifecycle (OpenAI, fal.ai) | `experimental_generateVideo()` |
| Text-to-Speech | Stable API, 6 output formats, speed control (OpenAI, Gemini, Grok, ElevenLabs, fal.ai) | `generateSpeech()` (experimental) |
| Transcription | Stable API with word timestamps and diarization (OpenAI, Grok, ElevenLabs, fal.ai) | `transcribe()` (experimental) |
| Audio / Music Generation | `generateAudio()` for music & sound effects (Gemini, ElevenLabs, fal.ai) | - |
| Summarization | Dedicated `summarize()` with streaming and style options | - |
| Code Execution | Node.js, Cloudflare Workers, QuickJS sandboxes you run yourself | Provider-hosted code-execution tools (Anthropic, xAI, OpenAI) |
| Code Mode Skills | LLM-writable persistent skill library | - |
| Coding Agent Sandboxes | First-party Grok Build, Claude Code, Codex, OpenCode harnesses **+ any ACP agent** via `acpCompatible`; runs on local-process, Docker, Daytona, Vercel, Sprites, or Cloudflare | `HarnessAgent` (experimental) — Claude Code, Codex, Pi, OpenCode, Deep Agents; centered on Vercel Sandbox |
| Realtime Voice | OpenAI, Grok, and ElevenLabs with VAD modes and tool support | - |
| DevTools | Isomorphic in-app panel via TanStack DevTools (all frameworks, media previews) | `devToolsMiddleware` + local inspector (server-side, dev-only) |
| Debug Logging | One flag, per-category toggles, pluggable logger | Warning logs + experimental telemetry hooks |
| MCP Client | Standalone host-side client (`@tanstack/ai-mcp`) + provider-routed `mcpTool()` | Built-in (`@ai-sdk/mcp`, stable) |
| MCP Apps (Interactive Widgets) | `ui://` widgets via `@mcp-ui/client`; React + Preact + framework-agnostic bridge; multi-server routing, pluggable session store, link-scheme hardening | `experimental_MCPAppRenderer` (React only); model-vs-app tool split; iframe sandbox + allowlist |
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
      { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } },
    ],
  }],
})
```

If you pass an image content part to a text-only model, TypeScript catches it at compile time.

### Tree-Shakeable Adapters

Every AI activity - chat, summarization, image generation, speech, transcription, video - is a separate import. Every provider exposes separate adapter functions per activity. If your app only uses chat, image generation code never enters your bundle.

```ts ignore
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

The same schema validates inputs and outputs on both sides. The type system tracks whether a tool is a `ServerTool` or `ClientTool` at compile time.

Vercel AI SDK defines tools with a `tool()` helper and does support client-side execution - a tool with no `execute` function is handled in the browser via the UI hook's `onToolCall` callback, with the result returned through `addToolOutput` (renamed from `addToolResult` in v6). What it doesn't have is a single shared contract that produces separate `.server()` and `.client()` implementations: server and client tool code are declared independently rather than derived from one definition.

### Composable Agent Loop Strategies

TanStack AI provides agent loop control as composable pure functions. Each strategy is `(state) => boolean` - return `true` to continue, `false` to stop.

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

`combineStrategies` composes them with AND logic - all strategies must agree to continue. You can add custom strategies alongside built-in ones:

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

Vercel AI SDK 6 added a provider-specific analogue for Anthropic: the tool search provider tool (`toolSearchBm25` / `toolSearchRegex`) with per-tool `deferLoading`, where deferred tools are excluded from the initial prompt and discovered on demand. It's Anthropic-only and runs provider-side; TanStack AI's lazy discovery works across every provider and runs in your own agent loop.

### Model Context Protocol (MCP)

TanStack AI connects to MCP servers two ways, and you can mix them in a single `chat()` run:

- **Host-side client** (`@tanstack/ai-mcp`) - your server connects directly to any MCP server. `createMCPClient` (single server) and `createMCPClients` (multi-server pool) discover and execute tools, read resources, and fetch prompts over Streamable HTTP, SSE, or stdio transports, with OAuth 2.1 (`authProvider`) and static-token auth.
- **Provider-routed** (`mcpTool()`) - the *provider* connects to the MCP server on your behalf (OpenAI Responses API, Anthropic), so no MCP traffic flows through your server at all.

The host-side client goes beyond basic discovery:

- **Managed lifecycle** - hand clients to `chat()` via the `mcp` option and it discovers tools and closes connections when the run ends - no `try/finally` per route.
- **Multi-server pools** - `createMCPClients` connects to many servers in parallel, auto-prefixing each server's tools to prevent name collisions.
- **Three modes of type safety** - untyped auto-discovery, `toolDefinition()`-typed allowlists with Zod validation, or fully generated per-server types via the `tanstack-ai-mcp` CLI.
- **Lazy discovery** - `tools({ lazy: true })` defers sending tool schemas to the LLM, plugging into TanStack AI's lazy tool discovery to cut token usage on tool-heavy servers.
- **Resources & prompts** - inject MCP resources and prompts into a run with `mcpResourceToContentPart` and `mcpPromptToMessages`.

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

Vercel AI SDK's `@ai-sdk/mcp` (`createMCPClient`) is a stable host-side client with HTTP/SSE transports, OAuth, resource reading, and prompt templates. TanStack AI's `@tanstack/ai-mcp` matches that surface and adds generated end-to-end types, multi-server pools, lazy discovery, a managed `chat()` lifecycle, and the provider-routed `mcpTool()` alternative.

### MCP Apps (Interactive Widgets)

Both SDKs implement [MCP Apps](https://modelcontextprotocol.io) — the ratified MCP extension (standardized 2026-01-26) where a server returns a `ui://` resource so a tool result renders as an interactive widget in a sandboxed iframe instead of raw JSON. Both keep the widget HTML out of model input and render it in a sandboxed iframe with a tool allowlist and safe link handling. TanStack AI's implementation is more built out along three axes:

- **More than one framework.** Widgets render via `@tanstack/ai-react/mcp-apps` and `@tanstack/ai-preact/mcp-apps`, and the bridge that routes widget actions (`createMcpAppBridge`) lives in the framework-agnostic `@tanstack/ai-client`, so a new framework only needs a thin renderer. Vercel's `experimental_MCPAppRenderer` and its bridge live in `@ai-sdk/react` — React only.
- **Multi-server routing.** Each `UIResourcePart` carries a `serverId` (the pool prefix from `createMCPClients`), and interactive calls route back to the exact server that produced the widget — automatically when you run a multi-server pool. The call handler also enforces an unconditional same-server exposure check (`toolName` must be a tool that server actually exposes) with an optional `allowTool` restriction AND-ed on top.
- **Session persistence & serverless-safety.** The call handler reconnects per call from a transport descriptor (stateless, serverless-safe by default), and stateful transports opt into a pluggable `McpSessionStore` — an `inMemoryMcpSessionStore` ships, and SQL/KV backends drop in behind the same interface.

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

Vercel AI SDK 7 covers the core flow and adds one thing TanStack AI doesn't: `splitMCPAppTools`, which separates *model-visible* tools from *app-only* tools the widget can call but the model never sees. Both implementations are new — Vercel marks its renderer `experimental_`, and TanStack AI's writeback of widget tool-calls into chat history is still out of scope. See the [MCP Apps guide](../mcp/apps) for the full API.

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

Your custom models appear in autocomplete alongside official ones. Vercel AI SDK covers the registration half of this with the now-stable `customProvider()` (custom and aliased model ids, settings overrides) and `createProviderRegistry()`; the difference is type-safety depth - registry model ids are plain strings, while `extendAdapter()` gives custom models the same literal-type narrowing and per-model option gating as official ones.

### Middleware

TanStack AI's middleware system hooks into every stage of the `chat()` lifecycle: configuration, streaming, tool execution, usage tracking, and completion. Each middleware is a plain object with named hooks that fire at specific phases.

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
    // Transform, expand, or drop chunks
    if ('delta' in chunk && 'messageId' in chunk) {
      return { ...chunk, delta: chunk.delta!.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]') }
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

Vercel AI SDK takes a different approach: `wrapLanguageModel()` wraps a model instance with middleware that can intercept and transform calls (and v6 adds `wrapEmbeddingModel()`). It ships several built-in middleware (`extractReasoningMiddleware`, `simulateStreamingMiddleware`, `defaultSettingsMiddleware`, and the new `devToolsMiddleware`), but these all operate at the model level rather than the application level. v6 also exposes per-call options that cover slices of this surface: `experimental_transform` for stream transforms, `experimental_onToolCallStart` / `experimental_onToolCallFinish` callbacks, `prepareStep` for per-step config changes, and `experimental_repairToolCall`. What it doesn't have is a unified middleware system at the application level - named, reusable middleware objects whose hooks span the whole lifecycle, compose in order, and can short-circuit tool calls with first-win semantics.

### No Platform Association

TanStack AI is a pure library. There's no optional platform layer, no gateway abstraction, no hosting-specific features, and no deployment-specific optimizations. Your AI code carries no implicit association with any deployment platform.

This isn't just philosophical - it means no accidental dependencies on platform-specific features, no gateway abstractions that subtly encourage vendor adoption, and no marketing surface embedded in your technical stack.

### Code Execution Sandboxes

TanStack AI provides three isolate drivers for safe code execution in AI workflows:

- **`@tanstack/ai-isolate-node`** - Node.js sandbox via `isolated-vm`
- **`@tanstack/ai-isolate-cloudflare`** - Cloudflare Workers sandbox
- **`@tanstack/ai-isolate-quickjs`** - QuickJS lightweight sandbox

All three implement the same `IsolateDriver` interface, so you can swap execution environments without changing application code. This powers TanStack AI's code mode - where the LLM writes and executes code as part of the agent loop. A companion `@tanstack/ai-code-mode-skills` package lets you give code mode a persistent, reusable library of runtime skills. Skills are LLM-writable: the model can save working TypeScript snippets, list and reuse them across sessions, with trust strategies controlling what gets promoted to a first-class tool. The closest AI SDK analogues - Anthropic's provider-hosted code execution and developer-uploaded skills, or pre-authored file skills loaded into a sandbox - are provider-specific and static; none give the model a persistent, provider-agnostic skill library it builds itself.

Vercel AI SDK does not provide built-in code execution sandboxes (though some providers expose their own server-side code execution as provider-executed tools).

### Coding Agent Sandboxes

Separately from the JS isolates above, TanStack AI can put a full **coding-agent CLI** — Claude Code, Codex, Grok Build, OpenCode, or any ACP-compliant agent — inside an isolated sandbox with a real filesystem, shell, and a cloned repo, and stream its work back through `chat()` like any other run. A sandboxed run composes three swappable pieces: a **provider** (where it runs), a **workspace** (what the agent sees), and a **harness adapter** (which agent runs). The sandbox is a `chat()` middleware, so the agent's edits and commands arrive as the same AG-UI stream every `useChat` UI already renders.

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

Two axes are open where the AI SDK's is narrower:

- **Any agent, not a fixed list.** Grok Build, Claude Code, Codex, and OpenCode ship as first-party harness packages, and `acpCompatible` (from `@tanstack/ai-acp`) turns *any* [Agent Client Protocol](https://agentclientprotocol.com) agent — `pi`, `gemini --acp`, and [dozens of others](https://agentclientprotocol.com/get-started/agents) — into a harness by describing how to launch it. Adding an agent doesn't require a dedicated adapter to exist.
- **Any sandbox, not one cloud.** The same run executes on `localProcessSandbox` (host dev loop), `dockerSandbox` (real container isolation), Daytona, Vercel Sandbox, Sprites, or Cloudflare — swap the provider without touching the harness or workspace. Providers declare their `capabilities()` (`fs`, `exec`, `ports`, `snapshots`, `fork`, `durableFilesystem`, …) so code degrades gracefully across them.

Vercel AI SDK 7 added a `HarnessAgent` API for the same idea — running a coding-agent harness in a sandbox and returning AI SDK-compatible `generate()` / `stream()` results. It's marked experimental, ships harnesses for Claude Code, Codex, Pi, OpenCode, and Deep Agents, and the documented path runs them in Vercel Sandbox. There's no generic ACP-compatible escape hatch (each supported harness is its own dedicated package), and sandbox support centers on Vercel's own microVM rather than a provider-swappable contract.

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

**Transcription** - `generateTranscription()` supports common output formats (json, text, srt, verbose_json, vtt), word-level timestamps with confidence scores, and four providers (OpenAI, Grok, ElevenLabs, fal.ai), with speaker diarization via OpenAI's `gpt-4o-transcribe-diarize` model.

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

**Audio & music generation** - `generateAudio()` generates music and sound effects across Gemini (Lyria), ElevenLabs (music + sound effects), and fal.ai. Vercel AI SDK has no equivalent.

**Summarization** - `summarize()` is a dedicated activity with style control (`bullet-points`, `paragraph`, `concise`), focus topics, and streaming support. Vercel AI SDK has no equivalent - summarization requires calling `generateText()` with a prompt.

**Realtime voice** - `realtimeToken()` enables bidirectional audio streaming with Voice Activity Detection modes (server, semantic, manual), tool calling during voice sessions, and simultaneous audio + text output. Three providers ship realtime adapters: OpenAI (Realtime API), Grok, and ElevenLabs. Vercel AI SDK has no realtime/bidirectional voice primitive - its audio support is batch-only (`generateSpeech` and `transcribe`).

All media activities follow the same adapter pattern as chat - tree-shakeable imports, per-model type safety, and streaming support. If your app only uses chat, none of this media code enters your bundle.

### Native AG-UI Protocol

The events TanStack AI streams between server and client are [AG-UI](https://docs.ag-ui.com/) events (`RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`), imported directly from `@ag-ui/core` - not a bespoke format with an AG-UI export bolted on. Anything that speaks AG-UI can sit on either side of the wire: AG-UI-compliant agent frameworks behind a TanStack AI frontend, or a TanStack AI client in front of an agent server written in another language entirely.

Vercel AI SDK streams its own proprietary UI Message Stream protocol. AG-UI interop requires an external translation layer (`@ag-ui/vercel-ai-sdk`, built and maintained by the AG-UI project), and native support remains an open feature request on the AI SDK repo.

### Hooks for Every Activity

Chat isn't the only activity with a hook. Every activity ships one - `useGeneration` (streaming structured output), `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`, `useTranscription`, `useSummarize`, `useGenerateVideo`, and `useRealtimeChat` - with the same connection-adapter wiring and devtools integration as `useChat`, across React, Solid, Vue, Svelte, and Preact.

Vercel AI SDK's UI layer has three hooks: `useChat`, `useCompletion`, and `useObject`. Its media functions (`generateImage()`, `experimental_generateVideo()`, speech, transcription) are server-side only - surfacing them in a UI means hand-rolling your own routes and client state.

### Multi-Turn Structured Output

Structured output in TanStack AI is part of the conversation, not a separate call. Pass `outputSchema` to `useChat` and every assistant turn carries its own typed `StructuredOutputPart` - streamed as a `partial`, validated as a `final`, preserved in message history, with the schema generic threading all the way down to `messages[i].parts[j].data`.

Vercel AI SDK's structured output (`generateObject` / `streamObject` / `Output`) is per-call: the typed object lives on the call result, the message-part union has no structured-output type, and combining `useChat` with typed structured output means manually parsing model text into custom data parts.

### Debug Logging

Set `debug: true` on any activity and the pipeline prints itself: raw provider chunks, post-middleware output, middleware hook inputs and outputs, tool execution, agent-loop iterations, config transforms, and request metadata - each category individually toggleable, with a pluggable `logger` for structured output. Vercel AI SDK's built-in logging covers provider warnings; richer observability goes through experimental telemetry hooks or the dev-only DevTools recorder rather than a debug log you can flip on anywhere.

### Community Adapter Ecosystem

TanStack AI publishes an open adapter specification. The community has already built adapters for Decart, Cencori, Cloudflare, Soniox, and Mynth - with a [guide for building your own](../community-adapters/guide). The adapter interface is simple enough that adding a new provider is a focused, self-contained task.

## Where Vercel AI SDK Excels

**Provider breadth.** Vercel AI SDK ships ~38 first-party, individually typed provider packages, plus a large community list. If you want a specific provider as a dedicated, maintained package without writing an adapter, their coverage is broader today. Raw model *count* is not the differentiator, though - TanStack AI's OpenRouter adapter reaches OpenRouter's full catalog (several hundred models), and the `openaiCompatible` adapter connects to any OpenAI-compatible endpoint.

**Angular support.** Vercel AI SDK has an official Angular integration. TanStack AI supports React, Solid, Svelte, Vue, and Preact, but not Angular. (Solid now cuts the other way: AI SDK's Solid package is community-maintained and pinned to an older SDK major, while TanStack AI ships an official, current Solid integration.)

**Agent abstraction.** Vercel AI SDK v6 ships a dedicated `Agent` abstraction (the `ToolLoopAgent` class) that packages a model, tools, instructions, and loop settings into a reusable object with `.generate()` and `.stream()` methods, plus `InferAgentUIMessage` for end-to-end type safety. TanStack AI composes these pieces per call rather than offering a single agent class.

**AI Gateway.** Vercel's optional AI Gateway adds centralized provider management - failover routing, caching, and a single key across providers - integrated with the Vercel platform (and used by default when no provider is configured). TanStack AI ships no gateway of its own; for the same centralized routing across a large model catalog, it recommends its first-class OpenRouter adapter, with no platform association attached.

**React Server Components.** Vercel AI SDK has an RSC integration via `@ai-sdk/rsc` (`AIState`, `StreamableValue`, `streamUI`). Note that Vercel documents this as experimental and recommends AI SDK UI for production - so it's an option for Next.js RSC apps rather than the primary path.

## Side-by-Side: Key Differences

### Tool Definition

**TanStack AI** - Isomorphic definitions with separate runtime implementations:

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

**Vercel AI SDK** - Tool objects via the `tool()` helper:

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

The TanStack approach separates the tool contract from its implementation, making tools reusable across server and client contexts.

### Agent Loop Control

**TanStack AI** - Composable strategies:

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

**Vercel AI SDK** - `stopWhen` conditions (v5+):

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
- **AG-UI native** - The wire protocol is AG-UI end to end; interoperate with the agent-UI ecosystem and non-TypeScript agent servers without a translation layer
- **Solid, Preact, or React Native** - One headless core covers React, Solid, Vue, Svelte, Preact, and React Native (via XHR adapters), all officially maintained
- **Hooks beyond chat** - `useGeneration`, `useGenerateImage`, `useSummarize`, and the rest of the generation hook family across every supported framework
- **Isomorphic tools** - Define a tool once and derive `.server()` / `.client()` implementations from one contract
- **App-level middleware** - Lifecycle hooks for chunks, tool calls, usage, and errors - not just model wrapping
- **Realtime voice** - Bidirectional audio across OpenAI, Grok, and ElevenLabs
- **No vendor association** - Pure library with no platform layer
- **Per-model type safety** - TypeScript narrows options per model, not per provider
- **Code execution** - Built-in sandboxed execution environments
- **Coding agent sandboxes** - Run Claude Code, Codex, Grok Build, OpenCode, or any ACP agent in a swappable sandbox (local, Docker, Daytona, Vercel, Sprites, Cloudflare), streamed through `chat()`
- **Flexible transport** - SSE, HTTP streams, XHR, RPC, direct iterables, or custom adapters
- **MCP, two ways** - A standalone host-side client (`@tanstack/ai-mcp`) with pools, codegen, and managed `chat()` lifecycle, plus a provider-routed `mcpTool()`

## When to Choose Vercel AI SDK

- **Need a first-party package for a specific provider** - ~38 dedicated, individually typed provider packages today (TanStack reaches comparable model breadth via OpenRouter + `openaiCompatible`)
- **Angular support** - Official Angular integration
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
