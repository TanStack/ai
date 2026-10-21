---
title: "TanStack AI vs Vercel AI SDK: Details"
id: vercel-ai-sdk-advanced
order: 2
description: "Feature-by-feature details for TanStack AI and the Vercel AI SDK, with code side by side and the areas where each SDK is stronger."
keywords:
  - tanstack ai
  - vercel ai sdk
  - comparison
  - ai sdk
  - alternatives
  - per-model types
  - middleware
  - mcp
  - code mode
  - sandbox
---

You read [the short comparison](./vercel-ai-sdk) and want the facts behind one row of the table. Each section below shows the TanStack AI code, then what the Vercel AI SDK does for the same job. Versions: TanStack AI at the time of writing, and Vercel AI SDK `ai@7.x`.

To move an app, use [Migration from Vercel AI SDK](../migration/migration-from-vercel-ai).

## Types and bundle size

### Per-model type safety

Pick a provider and a model, and TypeScript narrows the options, capabilities, and input modalities to that one model. You do not get a union of everything the provider supports.

Each provider adapter has a `model-meta.ts` file. It maps each model to its input modalities, context window, and provider options.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// TypeScript knows that gpt-5.6 accepts text and image input
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', content: 'What is in this image?' },
      { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } },
    ],
  }],
})
```

If you pass an image part to a text-only model, TypeScript stops it at compile time.

### Tree-shakeable adapters

Each activity is a separate import: chat, summarization, image, speech, transcription, and video. Each provider has one adapter function per activity. If your app uses only chat, no image code goes into your bundle.

```ts ignore
// Only chat code is bundled
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Add an activity only when you need it
import { chat, generateImage } from '@tanstack/ai'
import { openaiText, openaiImage } from '@tanstack/ai-openai'
```

Each adapter implements one interface (`TextAdapter`, `ImageAdapter`, `TTSAdapter`, and more) in its own module. The bundler removes what you do not import.

The Vercel AI SDK uses one import per provider:

```ts
// The provider package holds all model types
import { openai } from '@ai-sdk/openai'
```

### Extend an adapter

Fine-tuned models, OpenAI-compatible proxies, and custom endpoints need model ids that the adapter does not know. `extendAdapter()` adds them with full type safety:

```ts
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const customModels = [
  createModel('my-fine-tuned-gpt4', ['text', 'image']),
  createModel('company-internal-llm', ['text']),
] as const

const myOpenai = extendAdapter(openaiText, customModels)

// Autocomplete shows the official models and your custom models
const adapter = myOpenai('my-fine-tuned-gpt4')
```

The Vercel AI SDK registers custom and aliased model ids with the stable `customProvider()` and `createProviderRegistry()`. Registry model ids are plain strings. With `extendAdapter()`, custom models get the same literal types and per-model option checks as official models.

## Tools and agents

### Isomorphic tools

`toolDefinition()` makes one contract: name, description, input schema, and output schema. From that contract you add implementations:

- `.server()` runs on the server, with access to databases and APIs.
- `.client()` runs in the browser.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { db } from './db'

// One contract, shared by both sides
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

// Server implementation with database access
const addToCartServer = addToCartDef.server(async ({ itemId, quantity }) => {
  const cart = await db.carts.addItem(itemId, quantity)
  return { success: true, cartId: cart.id }
})

// Client implementation that runs in the browser
const addToCartClient = addToCartDef.client(async ({ itemId, quantity }) => {
  const res = await fetch(`/api/cart`, {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  })
  return res.json()
})
```

The same schema checks inputs and outputs on both sides. The type system knows at compile time if a tool is a `ServerTool` or a `ClientTool`.

The Vercel AI SDK defines tools with the `tool()` helper:

```ts
import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { weatherApi } from './weather'

const result = await generateText({
  model: openai('gpt-5.6'),
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

It runs client tools too. A tool with no `execute` function goes to the `onToolCall` callback of the UI hook, and you return the result with `addToolOutput` (called `addToolResult` before v6). The server and client code are separate declarations. They do not come from one shared definition.

### Agent loop strategies

A strategy is a pure function `(state) => boolean`. Return `true` to continue the loop, `false` to stop.

```ts
import { chat, maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { tools } from './tools'
import { estimatedTokens } from './cost'

const messages = [{ role: 'user' as const, content: 'Help me plan a trip.' }]

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  tools,
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    untilFinishReason(['stop', 'length']),
    // Custom: stop when the token budget runs out
    ({ iterationCount }) => estimatedTokens(iterationCount) < 50_000,
  ]),
})
```

`combineStrategies` uses AND logic. All strategies must agree to continue. A custom strategy can hold any business rule: a token budget, a cost limit, or a state check.

The Vercel AI SDK (v5 and later) uses `stopWhen`:

```ts
import { generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { tools } from './tools'

const result = await generateText({
  model: openai('gpt-5.6'),
  tools,
  stopWhen: stepCountIs(10), // also: hasToolCall('name'), or a custom function
  prompt: 'Help me plan a trip.',
})
```

`stopWhen` accepts an array of conditions, custom functions included. The default is `stepCountIs(20)`. v6 adds the `Agent` class (`ToolLoopAgent`), which holds the model, tools, instructions, and loop settings in one reusable object. The two loop models are now close. The difference is style: TanStack AI strategies are plain predicates that you write inline.

### Lazy tool discovery

With dozens of tools, it costs tokens to send every schema on every request. Mark a tool `lazy: true` and the LLM does not see its schema at first:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const searchProducts = toolDefinition({
  name: 'searchProducts',
  description: 'Search the product catalog',
  lazy: true, // Not sent to the LLM at first
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})
```

The LLM sees a small `__lazy__tool__discovery__` tool that lists the tool names. When it needs a tool, it calls the discovery tool to get the full schema. Then it calls the real tool. With a large tool set, this cuts the token cost of each request.

Vercel AI SDK 6 has a similar feature for Anthropic only: the tool search provider tool (`toolSearchBm25` / `toolSearchRegex`) with per-tool `deferLoading`. It runs on the provider side. TanStack AI lazy discovery works with every provider and runs in your own agent loop.

### Middleware

A middleware is a plain object with named hooks. The hooks fire at each stage of the `chat()` run: config, streaming, tool calls, usage, and completion.

```ts
import { chat, EventType, type ChatMiddleware } from '@tanstack/ai'
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
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  middleware: [logger],
})
```

The main hooks:

| Hook | Purpose |
|------|---------|
| `onConfig` | Change messages, tools, temperature, and system prompts per iteration |
| `onStructuredOutputConfig` | Change the structured-output schema or config before the call |
| `onStart` | Setup tasks (timers, logging) |
| `onIteration` | Observe each agent-loop iteration |
| `onChunk` | Transform, expand, or drop single stream chunks |
| `onBeforeToolCall` | Intercept tool calls: transform args, skip the call, or abort the run |
| `onAfterToolCall` | Observe tool results, timing, and errors |
| `onToolPhaseComplete` | Observe all tool results of one iteration (for example, the approval state of the batch) |
| `onUsage` | Track token usage per iteration |
| `onFinish` / `onAbort` / `onError` | Terminal hooks. Exactly one fires per run |

How middleware compose:

- `onConfig` passes through each middleware in order.
- `onChunk` passes each chunk through each middleware. If one middleware drops a chunk, the next ones do not see it.
- `onBeforeToolCall` is first-win. The first middleware that returns a decision stops the rest.

Built-in middleware:

- `toolCacheMiddleware` from `@tanstack/ai/middlewares` caches tool results by name and arguments. It has a TTL, LRU eviction, and pluggable storage (Redis, `localStorage`, and more).
- `contentGuardMiddleware` from `@tanstack/ai/middlewares`.
- `otelMiddleware` from `@tanstack/ai/middlewares/otel`. It has its own subpath, so `@opentelemetry/api` stays an optional peer.

```ts
import { toolCacheMiddleware, contentGuardMiddleware } from '@tanstack/ai/middlewares'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
```

The Vercel AI SDK wraps a model instance with `wrapLanguageModel()` (and `wrapEmbeddingModel()` from v6). Its built-in middleware (`extractReasoningMiddleware`, `simulateStreamingMiddleware`, `defaultSettingsMiddleware`, `devToolsMiddleware`) all work at the model level. v6 also has per-call options for parts of this job:

- `experimental_transform` for stream transforms.
- `experimental_onToolCallStart` / `experimental_onToolCallFinish` callbacks.
- `prepareStep` for per-step config changes.
- `experimental_repairToolCall`.

It has no app-level system of named, reusable middleware objects with hooks across the whole run, ordered composition, and first-win tool-call decisions.

## State that survives a reload

### Persistence

A reload or a second device must not wipe the conversation. `withPersistence` writes the transcript, the run status, and pending approvals to your store. The client has two modes:

- **`persistence: true`** puts the server in charge. The browser caches nothing and asks the server for the thread on mount.
- **`persistence: <adapter>`** puts the browser in charge, with `localStoragePersistence()`, `sessionStoragePersistence()`, or `indexedDBPersistence()`.

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })
  return <button onClick={() => sendMessage('hi')}>{messages.length}</button>
}
```

With `persistence: true`, add a `GET` that calls `reconstructChat`. That handler returns the stored transcript. If you also pass a durability adapter, the same `GET` can resume a run that still streams. See [Persistence](../persistence/overview).

Long media runs (video, batch images) use a second middleware, `withGenerationPersistence`. A reload restores `status`, `result`, and `error` into the same generation hook. See [Generation Persistence](../persistence/generation-persistence).

The Vercel AI SDK documents persistence as a pattern. You write `saveChat`, `loadChat`, and `validateUIMessages`, and you call them yourself:

```ts
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from 'ai'
import { loadChat, saveChat } from './chat-store'

export async function POST(req: Request) {
  const { message, id } = await req.json()
  const messages = [...(await loadChat(id)), message]

  const result = streamText({
    model: 'openai/gpt-5.6',
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: ({ messages: next }) => {
        saveChat({ chatId: id, messages: next })
      },
    }),
  })
}
```

It has no middleware that owns the transcript, the run status, or pending approvals.

### Resumable streams

A dropped socket is a different problem from a lost transcript. The model already ran. You want the rest of the tokens, not a second bill.

Pass a durability adapter to `toServerSentEventsResponse`. The adapter records each chunk before delivery. On reconnect, the client sends the last offset and the server replays the log.

- **`memoryStream`** from `@tanstack/ai` keeps the log in process memory. Use it in development.
- **`durableStream`** from `@tanstack/ai-durable-stream` writes to an external [Durable Streams](https://durablestreams.com) backend. Use it in production.

`useChat` reconnects on its own. You add a `GET` that calls `resumeServerSentEventsResponse`:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}

export function GET(request: Request) {
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) })
}
```

In production, replace `memoryStream(request)` with `durableStream(request, options)`. The rest stays the same. See [Resumable Streams](../resumable-streams/overview).

To resume with the Vercel AI SDK, you need Redis, the `resumable-stream` package, an `activeStreamId` that you store, and two routes that you write. The SDK gives `resume` on `useChat` and a `consumeSseStream` callback. The store and the wiring are yours.

### Durable sandbox runs

A coding agent can run for ten minutes. In that time the tab can close, the network can drop, and the next request can go to a different host.

- **Without durability**, TanStack AI destroys the sandbox on disconnect. This stops a runaway bill.
- **With durability**, the agent detaches and writes a journal at `/tmp/tanstack-runs/<runId>.ndjson`. A later `GET` can take the run over.

Turn it on with both `runs` and `durability` on `withSandbox`. If you pass only one, the sandbox is still destroyed on disconnect.

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { locks } from './locks'
import { persistence } from './persistence'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    runId,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs: persistence.stores.runs,
        durability: { adapter },
      }),
    ],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

Schedule the reaper. If you do not, sandboxes keep billing when no reader is left. Across hosts, use a distributed lock. See [Durable Runs](../sandbox/durable-runs).

The Vercel AI SDK runs long harness work with the experimental `HarnessAgent` and the Workflow SDK, centered on Vercel Sandbox. TanStack AI uses the same `chat()` + `withSandbox` path on each provider: local process, Docker, Docker Sandboxes, Daytona, Vercel, Sprites, or Cloudflare.

## Client and wire

### Headless client

`ChatClient` is a framework-agnostic class. It owns the chat lifecycle: streaming, message state, tool execution, approvals, and the connection. Each framework package wraps this one client:

| Package | Wrapper |
| --- | --- |
| `@tanstack/ai-react` | `useChat` hook |
| `@tanstack/ai-solid` | `useChat` hook |
| `@tanstack/ai-vue` | `useChat` composable |
| `@tanstack/ai-svelte` | `createChat` (Svelte 5 runes) |
| `@tanstack/ai-preact` | `useChat` hook |
| `@tanstack/ai-angular` | `injectChat` |

The core has no framework logic. A new framework needs only a thin reactive wrapper.

`ChatClient` also accepts:

- A persistence adapter (`ChatClientPersistence`) to save and restore conversations on the client.
- A typed runtime `context` that goes through to tools and middleware.

### Hooks for every activity

Each activity has a hook, not only chat:

- `useGeneration` (streaming structured output)
- `useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`
- `useGenerateSpeech`, `useTranscription`
- `useSummarize`
- `useRealtimeChat`

They use the same connection adapters and devtools as `useChat`, in React, Solid, Vue, Svelte, Preact, and Angular.

The Vercel AI SDK UI layer has three hooks: `useChat`, `useCompletion`, and `useObject`. Its media functions (`generateImage()`, `experimental_generateVideo()`, speech, transcription) are server-side only. To show them in a UI, you write your own routes and client state.

### Connection adapters

Swap the transport without a change to your app code:

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

// XHR-based SSE / HTTP streaming (React Native / Expo, where fetch streaming is not available)
xhrServerSentEvents('/api/chat')
xhrHttpStream('/api/chat')

// Direct async iterables (TanStack Start server functions)
stream((messages) => chatOnServer({ messages }))

// RPC-based transport
rpcStream((messages, data) => api.streamResponse(messages, data))

// Or implement your own ConnectionAdapter
```

`@tanstack/ai-client` also exports `webSocket` and `fetchJson`. Each adapter accepts a static or a function-based URL and options. For a lighter setup, the `fetcher` option on `ChatClient` / `useChat` connects a server function with no full adapter.

The Vercel AI SDK uses its SSE-based data stream protocol, with a `ChatTransport` interface to extend it. It does not ship the same set of built-in adapters. For example, it has no XHR adapters for React Native.

### Multi-turn structured output

Structured output stays in the conversation history, not only on a call result. The provider can produce it in the agent loop or in a separate final step. Both paths create a typed `StructuredOutputPart`. It streams as a `partial` and completes as a `final`. The schema type goes all the way down to `messages[i].parts[j].data`.

Vercel AI SDK structured output (`generateObject` / `streamObject` / `Output`) is per call. The typed object is on the call result. The message-part union has no structured-output type. To combine `useChat` with typed structured output, you parse model text into custom data parts yourself.

### Native AG-UI protocol

TanStack AI streams [AG-UI](https://docs.ag-ui.com/) events between server and client (`RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`). The types come directly from `@ag-ui/core`. Anything that speaks AG-UI can sit on either side of the wire:

- An AG-UI agent framework behind a TanStack AI frontend.
- A TanStack AI client in front of an agent server in a different language.

The Vercel AI SDK streams its own UI Message Stream protocol. For AG-UI, you need an external translation layer (`@ag-ui/vercel-ai-sdk`, which the AG-UI project maintains). Native support is an open feature request on the AI SDK repo.

## MCP

### MCP client

You can connect to MCP servers in two ways, and mix them in one `chat()` run:

- **Host-side client** (`@tanstack/ai-mcp`). Your server connects to the MCP server. `createMCPClient` (one server) and `createMCPClients` (a pool of servers) discover and run tools, read resources, and fetch prompts. Transports: Streamable HTTP, SSE, or stdio. Auth: OAuth 2.1 (`authProvider`) or a static token.
- **Provider-routed** (`mcpTool()`). The provider connects to the MCP server for you (OpenAI Responses API, Anthropic). No MCP traffic goes through your server.

What the host-side client adds:

- **Managed lifecycle.** Pass clients to `chat()` with the `mcp` option. It discovers tools and closes the connections when the run ends. You need no `try/finally` per route.
- **Multi-server pools.** `createMCPClients` connects to many servers in parallel and prefixes the tools of each server, so names do not collide.
- **Three levels of type safety.** Untyped auto-discovery, `toolDefinition()`-typed allowlists with Zod checks, or generated per-server types from the `tanstack-ai-mcp` CLI.
- **Lazy discovery.** `tools({ lazy: true })` holds back tool schemas from the LLM. This uses lazy tool discovery to cut tokens on servers with many tools.
- **Resources and prompts.** Add MCP resources and prompts to a run with `mcpResourceToContentPart` and `mcpPromptToMessages`.

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
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  mcp: { clients: [mcp] },
})
```

`createMCPClient` tries protocol `2026-07-28` first. If the server does not support that protocol, the client uses the 2025 initialize handshake.

- A client app imports `@modelcontextprotocol/client`.
- A server app imports `@modelcontextprotocol/server`.

Package names for an `@modelcontextprotocol/sdk` import are in [MCP SDK packages](../migration/mcp-sdk).

Vercel AI SDK `@ai-sdk/mcp` (`createMCPClient`) is a stable host-side client with HTTP/SSE transports, OAuth, resource reads, and prompt templates. `@tanstack/ai-mcp` has the same features. It adds generated end-to-end types, multi-server pools, lazy discovery, a managed `chat()` lifecycle, and the provider-routed `mcpTool()`.

### MCP Apps (interactive widgets)

Both SDKs implement [MCP Apps](https://modelcontextprotocol.io), the MCP extension (standard since 2026-01-26) where a server returns a `ui://` resource. The tool result then shows as an interactive widget in a sandboxed iframe, not as raw JSON. Both SDKs keep the widget HTML out of the model input, and both use a tool allowlist and safe link handling.

TanStack AI goes further in three areas:

- **More than one framework.** Widgets render through `@tanstack/ai-react/mcp-apps` and `@tanstack/ai-preact/mcp-apps`. The bridge for widget actions (`createMcpAppBridge`) is in the framework-agnostic `@tanstack/ai-client`, so a new framework needs only a thin renderer. Vercel `experimental_MCPAppRenderer` and its bridge are in `@ai-sdk/react`, so React only.
- **Multi-server routing.** Each `UIResourcePart` has a `serverId` (the pool prefix from `createMCPClients`). Interactive calls go back to the server that made the widget. The call handler always checks that `toolName` is a tool that this server exposes. An optional `allowTool` adds one more restriction on top.
- **Sessions and serverless.** By default, the call handler reconnects per call from a transport descriptor, so it is stateless and safe on serverless. Stateful transports can use a pluggable `McpSessionStore`. `inMemoryMcpSessionStore` ships, and SQL or KV backends use the same interface.

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

Vercel AI SDK 7 covers the core flow. It also has one thing that TanStack AI does not: `splitMCPAppTools`, which splits *model-visible* tools from *app-only* tools that the widget can call but the model never sees. Both implementations are new. Vercel marks its renderer `experimental_`. TanStack AI does not write widget tool-calls back into chat history. See the [MCP Apps guide](../mcp/apps) for the full API.

## Code Mode and sandboxes

### Code Mode

Code Mode lets the model write TypeScript that calls your tools inside a sandbox. One `execute_typescript` call can loop, branch, and use `Promise.all`. The model does not need one tool call per turn.

Six isolate drivers sit behind one `IsolateDriver` interface:

| Package | Runs on |
| --- | --- |
| `@tanstack/ai-isolate-node` | Node.js, through `isolated-vm` |
| `@tanstack/ai-isolate-quickjs` | QuickJS WASM (browsers and edge) |
| `@tanstack/ai-isolate-quickjs-bun` | Native QuickJS on Bun, through `bun:ffi` |
| `@tanstack/ai-isolate-cloudflare` | Cloudflare Workers |
| `@tanstack/ai-isolate-daytona` | A remote Daytona sandbox |
| `@tanstack/ai-isolate-e2b` | A remote E2B sandbox |

You can swap the driver with no change to your app code. The `@tanstack/ai-code-mode-snippets` package gives the model a persistent snippet library. The model can save working TypeScript snippets, list them, and use them again in later sessions. Trust strategies control which snippets become first-class tools.

The Vercel AI SDK ships the experimental `@ai-sdk/code-mode`. It runs QuickJS only, needs Node 22 or later, and does not run in the browser or on the edge. It rejects nested tool approvals. Provider-hosted code execution (Anthropic, xAI, OpenAI) is a separate path. None of these give the model a persistent, provider-agnostic library that it builds itself. See [Code Mode](../code-mode/code-mode).

### Coding agent sandboxes

TanStack AI can also put a full coding-agent CLI in an isolated sandbox, with a real filesystem, a shell, and a cloned repo. The agent can be Claude Code, Codex, Grok Build, OpenCode, or any ACP agent. Its work streams back through `chat()` like any other run.

A sandboxed run has three parts that you can swap:

- A **provider**: where it runs.
- A **workspace**: what the agent sees.
- A **harness adapter**: which agent runs.

The sandbox is a `chat()` middleware. The edits and commands of the agent arrive as the same AG-UI stream that each `useChat` UI already renders.

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

Two things are open:

- **Any agent.** Grok Build, Claude Code, Codex, and OpenCode are first-party harness packages. `acpCompatible` from `@tanstack/ai-acp` turns any [Agent Client Protocol](https://agentclientprotocol.com) agent into a harness (`pi`, `gemini --acp`, and [many more](https://agentclientprotocol.com/get-started/agents)). You only describe how to launch it.
- **Any sandbox.** The same run works on `localProcessSandbox` (host dev loop), `dockerSandbox` (container), `sbxSandbox` (Docker Sandboxes microVM), Daytona, Vercel Sandbox, Sprites, or Cloudflare. Swap the provider with no change to the harness or the workspace. Providers declare their `capabilities()` (`fs`, `exec`, `ports`, `snapshots`, `fork`, `durableFilesystem`, and more), so code can adapt to each one.

Vercel AI SDK 7 has an experimental `HarnessAgent` API for the same idea. It runs a coding-agent harness in a sandbox and returns AI SDK `generate()` / `stream()` results. It ships adapters for Claude Code, Codex, Grok Build, OpenCode, Deep Agents, and Pi. The documented path runs them in Vercel Sandbox, with long work on the Workflow SDK. Each harness is its own package, with no generic ACP adapter. Sandbox support centers on the Vercel microVM, not on a contract where you swap the provider. See [Sandbox providers](../sandbox/providers) and [Harnesses](../sandbox/harnesses).

## Media generation

Each media activity has a stable, dedicated API: image, video, speech, transcription, audio, and summarization. Each is a separate, tree-shakeable function with its own adapter per provider.

In the Vercel AI SDK, `generateImage()` is stable (v6). Video is experimental (`experimental_generateVideo()`). `generateSpeech()` and `transcribe()` have no `experimental_` prefix, but the docs still mark them experimental.

### Image

`generateImage()` has per-model type safety. TypeScript knows that `gpt-image-2` and `dall-e-3` allow different sizes. Providers: OpenAI (GPT Image, DALL-E), Gemini (Imagen), Grok, OpenRouter, and fal.ai (600+ community models, Flux and SDXL included).

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

### Video

Video APIs are async: you submit a job, poll for the status, and then get the result. `generateVideo()` runs this whole job lifecycle for you. You set the polling interval and timeout, and status updates stream back to the client.

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
  // Receive: job created, then status updates, then the final video URL
}
```

Vercel `experimental_generateVideo()` returns the video directly. It does not show the job lifecycle or stream status updates.

### Speech

`generateSpeech()` has 6 output formats (mp3, opus, aac, flac, wav, pcm) and speed control (0.25x to 4x). Providers: OpenAI (11 voices), Gemini (30+ voices with language hints), Grok, ElevenLabs, and fal.ai.

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

### Transcription

`generateTranscription()` has the common output formats (json, text, srt, verbose_json, vtt) and word-level timestamps with confidence scores. Providers: OpenAI, Grok, ElevenLabs, and fal.ai. Speaker diarization works with the OpenAI `gpt-4o-transcribe-diarize` model.

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

### Audio, summarization, and realtime voice

- **Audio and music.** `generateAudio()` makes music and sound effects with Gemini (Lyria), ElevenLabs (music + sound effects), and fal.ai. The Vercel AI SDK has no equivalent.
- **Summarization.** `summarize()` is a dedicated activity with style control (`bullet-points`, `paragraph`, `concise`), focus topics, and streaming. In the Vercel AI SDK, you call `generateText()` with a prompt.
- **Realtime voice.** `realtimeToken()` starts two-way audio streaming. It has Voice Activity Detection modes (server, semantic, manual) and tool calls during voice sessions. It can output audio and text at the same time. Providers: OpenAI (Realtime API), Grok, and ElevenLabs. The Vercel AI SDK ships experimental `experimental_useRealtime` for OpenAI, Google, and xAI (plus AI Gateway). The TanStack AI realtime adapters are stable and include ElevenLabs.

All media activities use the same adapter pattern as chat: tree-shakeable imports, per-model type safety, and streaming. If your app uses only chat, no media code goes into your bundle.

## Debugging and ecosystem

### Debug logging

Set `debug: true` on any activity and the pipeline prints itself. Each category has its own toggle:

- Raw provider chunks and the output after middleware.
- Middleware hook inputs and outputs, and config transforms.
- Tool execution and agent-loop iterations.
- Request metadata.

A pluggable `logger` gives you structured output. The Vercel AI SDK logs provider warnings. For more, it uses experimental telemetry hooks or the dev-only DevTools recorder.

### Adapter ecosystem

TanStack AI publishes an open adapter specification. Official LLM adapters:

- OpenAI, Anthropic, Gemini, Vertex, Grok, Groq, OpenRouter, Ollama
- Bedrock, BytePlus, Mistral, Cohere, ElevenLabs, fal
- Vercel AI Gateway, and any OpenAI-compatible endpoint through `openaiCompatible`

Harness adapters: Grok Build, Claude Code, Codex, OpenCode, and any ACP agent through `acpCompatible`. Community adapters exist for Decart, Cencori, Cloudflare, Soniox, and Mynth. To build your own, see the [community adapter guide](../community-adapters/guide).

### No platform association

TanStack AI is a library only. It has no platform layer, no gateway, no hosting features, and no deployment tuning. Your AI code has no hidden dependency on a hosting platform.

## Where the Vercel AI SDK is stronger

- **Provider packages.** The Vercel AI SDK ships about 38 first-party, typed provider packages, plus a large community list. If you want a maintained package for one specific provider, its coverage is wider today. Model count is not the difference: the TanStack AI OpenRouter adapter reaches the full OpenRouter catalog, the Vercel Gateway adapter routes with one key, and `openaiCompatible` connects to any OpenAI-compatible endpoint.
- **Agent class.** The Vercel AI SDK `Agent` class (`ToolLoopAgent`) holds a model, tools, instructions, and loop settings in one reusable object, with `.generate()` and `.stream()`. `InferAgentUIMessage` gives end-to-end types. TanStack AI puts these pieces together per call. It has no single agent class.
- **AI Gateway.** The optional Vercel AI Gateway adds central provider management: failover routing, caching, and one key for all providers, linked to the Vercel platform. It is the default when no provider is set. TanStack AI has no gateway of its own. For central routing, use the [OpenRouter](../adapters/openrouter) adapter or the [Vercel AI Gateway](../adapters/vercel-gateway) adapter. Neither adds a platform layer to the rest of your stack.
- **React Server Components.** `@ai-sdk/rsc` gives RSC primitives (`AIState`, `StreamableValue`, `streamUI`). Vercel marks it experimental and recommends AI SDK UI for production.

Framework support cuts both ways. Both SDKs ship official Angular. For Solid, the AI SDK package is community-maintained and pinned to an older SDK major. TanStack AI ships an official, current Solid package.
