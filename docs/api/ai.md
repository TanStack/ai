---
title: "@tanstack/ai"
id: tanstack-ai-api
order: 1
description: "API reference for @tanstack/ai — the core TanStack AI library providing chat(), generateImage(), toolDefinition(), and streaming utilities."
keywords:
  - tanstack ai
  - "@tanstack/ai"
  - api reference
  - chat
  - toolDefinition
  - generateImage
  - core library
---

The core AI library for TanStack AI.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai
vue: @tanstack/ai
solid: @tanstack/ai
svelte: @tanstack/ai
preact: @tanstack/ai
angular: @tanstack/ai
vanilla: @tanstack/ai
octane: @tanstack/ai

<!-- ::end:tabs -->

## `chat(options)`

Creates a streaming chat response.

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { myTool } from "./tools";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `adapter` - An AI adapter instance with model (e.g., `openaiText('gpt-5.2')`, `anthropicText('claude-sonnet-4-5')`)
- `messages` - Array of chat messages. Accepts mixed `UIMessage | ModelMessage` arrays — internal conversion handles AG-UI fan-out dedup, drops `reasoning`/`activity`, and collapses `developer` → `system`
- `tools?` - Array of tools for function calling
- `context?` - Typed runtime context passed to server tools and middleware. If a tool or middleware declares a concrete context type, `chat()` requires a compatible value here
- `systemPrompts?` - System prompts to prepend to messages
- `agentLoopStrategy?` - Strategy for agent loops (default: `maxIterations(5)`). Strategies receive `{ iterationCount, finishReason, messages, toolCallCount, lastTurnToolCallCount }` and run between model turns. Iterations are model turns, not tool calls — for tool-call budgets use middleware (`onBeforeToolCall` + `onShouldContinue`); see [Tool-call budgets](../chat/agentic-cycle#tool-call-budgets-middleware-recipe).
- `middleware?` - Array of chat middleware. Use `onShouldContinue` / `onBeforeToolCall` for app-owned tool budgets.
- `abortController?` - AbortController for cancellation
- `modelOptions?` - Provider-native model options. This is where sampling parameters live — `temperature`, `top_p`/`topP`, and the provider's token-limit key (`max_output_tokens`, `max_tokens`, `maxOutputTokens`, …) — under each provider's canonical name, rather than as generic root-level props. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options). (Renamed from `providerOptions`.)
- `threadId?` - AG-UI thread identifier propagated into `RUN_STARTED` events for run correlation
- `runId?` - AG-UI run identifier (auto-generated if omitted)
- `parentRunId?` - AG-UI parent run identifier for nested runs

### Returns

An async iterable of `StreamChunk`.

## `summarize(options)`

Creates a text summarization.

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5.2"),
  text: "Long text to summarize...",
  maxLength: 100,
  style: "concise",
});
```

### Parameters

- `adapter` - An AI adapter instance with model
- `text` - Text to summarize
- `maxLength?` - Maximum length of summary
- `style?` - Summary style ("concise" | "detailed")
- `modelOptions?` - Model-specific options

### Returns

A `SummarizationResult` with the summary text.

## `toolDefinition(config)`

Creates an isomorphic tool definition that can be instantiated for server or client execution.

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const myToolDef = toolDefinition({
  name: "my_tool",
  description: "Tool description",
  inputSchema: z.object({
    param: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  needsApproval: false, // Optional
});

// Or create client implementation
const myClientTool = myToolDef.client(async ({ param }) => {
  // Client-side implementation
  return { result: "..." };
});

// Use directly in chat() (server-side, no execute)
chat({
  adapter: openaiText("gpt-5.2"),
  tools: [myToolDef],
  messages: [{ role: "user", content: "..." }],
});

// Or create server implementation
const myServerTool = myToolDef.server(async ({ param }) => {
  // Server-side implementation
  return { result: "..." };
});

// Use directly in chat() (server-side, no execute)
chat({
  adapter: openaiText("gpt-5.2"),
  tools: [myServerTool],
  messages: [{ role: "user", content: "..." }],
});
```

Tools can declare typed runtime context for request-scoped dependencies:

```typescript
import { chat, toolDefinition, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { session, db } from "./app";

type AppContext = {
  userId: string;
  db: { users: { findName(id: string): Promise<string> } };
};

const currentUser = toolDefinition({
  name: "current_user",
  description: "Get the current user",
}).server<AppContext>(async (_input: unknown, ctx) => {
  return { name: await ctx.context.db.users.findName(ctx.context.userId) };
});

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages,
    tools: [currentUser],
    context: { userId: session.user.id, db },
  });
  return toServerSentEventsResponse(stream);
}
```

### Parameters

- `name` - Tool name (must be unique)
- `description` - Tool description for the model
- `inputSchema` - Zod schema for input validation
- `outputSchema?` - Zod schema for output validation
- `needsApproval?` - Whether tool requires user approval
- `metadata?` - Additional metadata

### Returns

A `ToolDefinition` object with `.server()` and `.client()` methods for creating concrete implementations.

## `toServerSentEventsStream(stream, abortController?)`

Converts a stream to a ReadableStream in Server-Sent Events format.

```typescript
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
const readableStream = toServerSentEventsStream(stream);
```

### Parameters

- `stream` - Async iterable of `StreamChunk`
- `abortController?` - Optional AbortController to abort when stream is cancelled

### Returns

A `ReadableStream<Uint8Array>` in Server-Sent Events format. Each chunk is:
- Prefixed with `"data: "`
- Followed by `"\n\n"`
- Stream ends with `"data: [DONE]\n\n"`

## `toServerSentEventsResponse(stream, init?)`

Converts a stream to an HTTP Response with proper SSE headers.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

async function POST() {
  const stream = chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "Hello!" }],
  });
  return toServerSentEventsResponse(stream);
}
```

### Parameters

- `stream` - Async iterable of `StreamChunk`
- `init?` - Optional ResponseInit options (including `abortController`)

### Returns

A `Response` object suitable for HTTP endpoints with SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).

## `chatParamsFromRequest(req)`

Reads an HTTP `Request`, parses its JSON body, and validates it against AG-UI `RunAgentInputSchema`. Returns parsed chat parameters ready to spread into `chat()`. On a malformed body, **throws a 400 `Response`** that frameworks like TanStack Start, SolidStart, Remix, and React Router 7 return to the client automatically.

```typescript
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: serverTools,
  });
  return toServerSentEventsResponse(stream);
}
```

### Parameters

- `req` - An incoming `Request` whose JSON body conforms to AG-UI `RunAgentInput`

### Returns

A promise resolving to `{ messages, threadId, runId, parentRunId?, tools, forwardedProps, state, aguiContext, context }`.

The returned `aguiContext` is the AG-UI protocol `RunAgentInput.context` field. It is not the same as TanStack AI runtime `chat({ context })`; validate and map it explicitly if you want those values available to tools or middleware.

The returned `context` field is a deprecated alias of `aguiContext` kept for backward compatibility. Prefer `aguiContext` in new code.

> **Framework note.** Next.js Route Handlers, SvelteKit, Hono, and raw Node do not auto-handle thrown `Response` objects. In those, wrap with try/catch or use `chatParamsFromRequestBody(await req.json())` directly.

## `chatParamsFromRequestBody(body)`

Lower-level variant of `chatParamsFromRequest` that validates an already-parsed body. Rejects with an `AGUIError` on malformed input. Use this when you need explicit error handling control.

```typescript
import { chatParamsFromRequestBody } from "@tanstack/ai";

async function handler(req: Request): Promise<Response> {
  const body = await req.json();
  try {
    const params = await chatParamsFromRequestBody(body);
    // ...
    return new Response("ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: 400 });
  }
}
```

## `mergeAgentTools(serverTools, clientTools)`

Merges a server-side tool registry with the AG-UI client-declared tools received in the request payload. Server tools win on name collision; client-only tools become no-execute stubs that the runtime dispatches via `ClientToolRequest` events.

```typescript
import { chat, chatParamsFromRequest, mergeAgentTools } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

async function handler(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages: params.messages,
    tools: mergeAgentTools(serverTools, params.tools),
  });
}
```

### Parameters

- `serverTools` - The server's `toolDefinition().server(...)` registry, keyed by tool name
- `clientTools` - The `tools` array from `chatParamsFromRequest`'s return value

### Returns

A merged tool record suitable for `chat({ tools })`.

## `maxIterations(count)`

Creates an agent loop strategy that limits **model turns** (iterations), not tool calls. One turn can still emit many parallel tool calls — use middleware for tool-call budgets ([recipe](../chat/agentic-cycle#tool-call-budgets-middleware-recipe)).

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `count` - Maximum number of model turns

### Returns

An `AgentLoopStrategy` function.

## `defineByokProvider({ id, label, env? })`

Declare a BYOK provider from an adapter package. `id` is the `x-byok-<id>` slug and is **required** — an optional or missing `id` does not type-check.

```typescript
import { defineByokProvider } from "@tanstack/ai/byok";

export const openaiByok = defineByokProvider({
  id: "openai",
  label: "OpenAI",
  env: "OPENAI_API_KEY",
});
```

Import the object from the adapter `/byok` subpath (`openaiByok` from `@tanstack/ai-openai/byok`). Pass it to `getByokKey` on the relay. Do not import it from the adapter main entry. That pulls in the provider SDK. Import `getByokKey` from `@tanstack/ai/byok/server`. That entry is the only BYOK module that reads `process.env`.

### Parameters

- `id` - Required slug (`[a-z][a-z0-9-]{0,63}`)
- `label` - Display name
- `env?` - Env var **name**, or a list of names tried in order. A string is stored as a one-element array. Names only — this object is imported on the client, so do not put `process.env` values here

### Returns

A `{ id, label, env? }` object. `id` is the literal slug type.

## `getByokKey(request, provider)`

Read a key on the relay. Import from `@tanstack/ai/byok/server` so `process.env` is not in the client graph. Works in any API route — it is not a TanStack Start server function.

The header wins. A `ByokProvider` then tries `provider.env` in order. A slug is header-only. Returns `null` when both are empty. The JSON body is ignored.

```typescript
import { getByokKey } from "@tanstack/ai/byok/server";
import { openaiByok } from "@tanstack/ai-openai/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, openaiByok);
  return new Response(apiKey ? "ok" : "missing");
}
```

### Parameters

- `request` - Incoming `Request`
- `provider` - A `ByokProvider` or a provider slug (`[a-z][a-z0-9-]{0,63}`). Becomes the `x-byok-<slug>` header. Not a fixed catalog.

### Returns

`string | null`

## `getByokKeys(request, providers)`

Read several keys at once. Each entry obeys the same rules as `getByokKey`. Use it when one credential is made of more than one value.

```typescript
import { byokMissing, getByokKeys } from "@tanstack/ai/byok/server";
import {
  cloudflareAccountByok,
  cloudflareByok,
} from "@tanstack/ai-cloudflare/byok";

export async function POST(request: Request) {
  const { apiKey, accountId } = getByokKeys(request, {
    apiKey: cloudflareByok,
    accountId: cloudflareAccountByok,
  });
  if (!apiKey) return byokMissing(cloudflareByok);
  if (!accountId) return byokMissing(cloudflareAccountByok);
  return new Response("ok");
}
```

### Parameters

- `request` - Incoming `Request`
- `providers` - An object whose values are a `ByokProvider` or a provider slug. The keys name the result.

### Returns

An object with the same keys, each `string | null`.

## `byokMissing(provider)`

Return a `401` JSON `Response` with `{ error: { type: "byok_missing", provider, message } }`. The chat and generation clients read this body and set `snapshot.prompt`. Import from `@tanstack/ai/byok` or `@tanstack/ai/byok/server`.

```typescript
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { openaiByok } from "@tanstack/ai-openai/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);
  return new Response("ok");
}
```

### Parameters

- `provider` - A `ByokProvider` or a provider slug to put on the error body

### Returns

A `Response` with status `401` and `content-type: application/json`.

## `maskKey(key)`

Return the last four characters of a key. Keys of four characters or fewer become `"••"`.

```typescript
import { maskKey } from "@tanstack/ai/byok";

maskKey("sk-abcdefghij"); // "ghij"
```

## `scrubSecrets(input, secrets)`

Replace each listed secret in `input` with `[redacted]`. Use this before you log an error string.

```typescript
import { scrubSecrets } from "@tanstack/ai/byok";

scrubSecrets("failed sk-live extra", ["sk-live"]);
// "failed [redacted] extra"
```

See [Bring Your Own Key](../advanced/byok) for the client store and a full relay.

## Types

### `ModelMessage`

```typescript
import type {
  ContentPart,
  StructuredOutputPart,
  ToolCall,
} from "@tanstack/ai";

interface ModelMessage<
  TContent extends string | null | ContentPart[] =
    | string
    | null
    | ContentPart[],
> {
  role: "user" | "assistant" | "tool";
  content: TContent;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  thinking?: Array<{ content: string; signature?: string }>;
  structuredOutput?: StructuredOutputPart;
  id?: string;
  createdAt?: Date;
}
```

### `StreamChunk`

```typescript ignore
type StreamChunk =
  | ContentStreamChunk
  | ThinkingStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;

interface ThinkingStreamChunk {
  type: "thinking";
  id: string;
  model: string;
  timestamp: number;
  delta?: string; // Incremental thinking token
  content: string; // Accumulated thinking content
}
```

Stream chunks represent different types of data in the stream:

- **Content chunks** - Text content being generated
- **Thinking chunks** - Model's reasoning process (when supported by the model)
- **Tool call chunks** - When the model calls a tool
- **Tool result chunks** - Results from tool execution
- **Done chunks** - Stream completion
- **Error chunks** - Stream errors

### `Tool`

```typescript
import type { SchemaInput, ToolExecutionContext } from "@tanstack/ai";

interface Tool<TContext = unknown> {
  name: string;
  description: string;
  inputSchema?: SchemaInput;
  outputSchema?: SchemaInput;
  execute?: (
    args: any,
    context?: ToolExecutionContext<TContext>
  ) => Promise<any> | any;
  needsApproval?: boolean;
  lazy?: boolean;
  metadata?: Record<string, any>;
}
```

### `ToolExecutionContext<TContext>`

```typescript ignore
type ToolExecutionContext<TContext = unknown> = {
  toolCallId?: string;
  emitCustomEvent: (eventName: string, value: Record<string, any>) => void;
} & (unknown extends TContext ? { context?: TContext } : { context: TContext });
```

`context` is the runtime value from `chat({ context })` for server tools, or from `ChatClient` / framework hook options for client tools. It is required when a tool declares a concrete `TContext` and optional for untyped tools where the context type is `unknown`.

### `ChatMiddleware<TContext>`

```typescript
import type {
  StreamChunk,
  ChatMiddlewarePhase,
  ToolCallHookContext,
  BeforeToolCallDecision,
  AfterToolCallInfo,
  FinishInfo,
  AbortInfo,
  ErrorInfo,
} from "@tanstack/ai";

interface ChatMiddlewareContext<TContext = unknown> {
  requestId: string;
  streamId: string;
  threadId: string;
  phase: ChatMiddlewarePhase;
  iteration: number;
  context: TContext;
  abort(reason?: string): void;
  defer(promise: Promise<unknown>): void;
}

interface ChatMiddleware<TContext = unknown> {
  name?: string;
  onStart?: (ctx: ChatMiddlewareContext<TContext>) => void | Promise<void>;
  onChunk?: (
    ctx: ChatMiddlewareContext<TContext>,
    chunk: StreamChunk
  ) => void | StreamChunk | StreamChunk[] | null | Promise<void | StreamChunk | StreamChunk[] | null>;
  onBeforeToolCall?: (
    ctx: ChatMiddlewareContext<TContext>,
    hookCtx: ToolCallHookContext
  ) => BeforeToolCallDecision | Promise<BeforeToolCallDecision>;
  onAfterToolCall?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: AfterToolCallInfo
  ) => void | Promise<void>;
  onFinish?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: FinishInfo
  ) => void | Promise<void>;
  onAbort?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: AbortInfo
  ) => void | Promise<void>;
  onError?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: ErrorInfo
  ) => void | Promise<void>;
}
```

See [Runtime Context](../advanced/runtime-context) for the recommended context patterns.

## Usage Examples

```typescript
import { chat, summarize, generateImage, toolDefinition } from "@tanstack/ai";
import {
  openaiText,
  openaiSummarize,
  openaiImage,
} from "@tanstack/ai-openai";
import { z } from "zod";

// --- Streaming chat
const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});

// --- Structured response with tools
const weatherTool = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string(),
  }),
}).server(async ({ city }) => {
  // Implementation that fetches weather info
  return JSON.stringify({ temperature: 72, condition: "Sunny" });
});

async function examples() {
  // --- One-shot chat response (stream: false)
  const response = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "What's the capital of France?" }],
    stream: false, // Returns a Promise<string> instead of AsyncIterable
  });

  // --- Structured response with outputSchema
  const parsed = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [{ role: "user", content: "Summarize this text in JSON with keys 'summary' and 'keywords': ... " }],
    outputSchema: z.object({
      summary: z.string(),
      keywords: z.array(z.string()),
    }),
  });

  const toolResult = await chat({
    adapter: openaiText("gpt-5.2"),
    messages: [
      { role: "user", content: "What's the weather in Paris?" }
    ],
    tools: [weatherTool],
    outputSchema: z.object({
      answer: z.string(),
      weather: z.object({
        temperature: z.number(),
        condition: z.string(),
      }),
    }),
  });

  // --- Summarization
  const summary = await summarize({
    adapter: openaiSummarize("gpt-5.2"),
    text: "Long text to summarize...",
    maxLength: 100,
  });

  // --- Image generation
  const image = await generateImage({
    adapter: openaiImage("dall-e-3"),
    prompt: "A futuristic city skyline at sunset",
    numberOfImages: 1,
    size: "1024x1024",
  });
}
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Bring Your Own Key](../advanced/byok) - Read user keys on the relay
- [Tools Guide](../tools/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options
