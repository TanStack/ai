---
title: "@tanstack/ai"
id: tanstack-ai-api
order: 1
description: "API reference for @tanstack/ai, the core server library: chat(), toolDefinition(), decide(), the generation functions, response helpers, and BYOK."
keywords:
  - tanstack ai
  - "@tanstack/ai"
  - api reference
  - chat
  - toolDefinition
  - generateImage
  - decide
  - core library
---

The core library. It runs chats and generations on the server, defines tools, and turns streams into HTTP responses. To build your first chat, start with the [Quick Start](../getting-started/quick-start).

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

You also need an adapter package, for example `@tanstack/ai-openai`. See [Adapters](../adapters/openai).

## `chat`

Runs a chat with a model, including tool calls, and streams the result. See [Streaming](../chat/streaming).

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { myTool } from "./tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Options

Required:

| Option | What it does |
| --- | --- |
| `adapter` | A text adapter with a model, for example `openaiText("gpt-6.1-sol")`. |
| `messages` | The conversation. Accepts `UIMessage` and `ModelMessage` items, mixed in one array. |

Common:

| Option | What it does |
| --- | --- |
| `tools` | Tools from `toolDefinition()`, or provider tools such as `webSearchTool`. See [Tools](../tools/tools). |
| `systemPrompts` | Strings, or `{ content, metadata }` objects, put before the messages. |
| `outputSchema` | A Standard Schema. The call resolves to the parsed object. See [Structured Outputs](../structured-outputs/overview). |
| `stream` | `false` to get one result when the run ends. See [Returns](#returns). |
| `modelOptions` | Provider options, typed by the adapter. Sampling settings go here, under the name that each provider uses (`temperature`, `max_output_tokens`, and so on). See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options). |
| `reasoning` | How hard the model thinks: a level such as `"low"` or `"high"`, or `{ level, summary?, budgetTokens? }`. `"off"` turns it off. See [Reasoning](../chat/reasoning). |
| `context` | Typed runtime context for server tools and middleware. If a tool or middleware declares a context type, this option is required. See [Runtime Context](../advanced/runtime-context). |
| `middleware` | Chat middleware, called in array order. See [Middleware](../advanced/middleware). |
| `abortController` | Cancels the run. |

Agent loop and tools:

| Option | What it does |
| --- | --- |
| `agentLoopStrategy` | When the loop stops. Default: `combineStrategies([maxIterations(5), untilFinishReason(["length"])])`. See [Agent loop strategies](#agent-loop-strategies). |
| `toolChoice` | `"auto"`, `"none"`, `"required"`, or `{ type: "tool", name }`. Applies to every model call of the run. |
| `toolExecution` | `"parallel"` (default) or `"sequential"`: how the server tools of one model turn run. |
| `repairToolInput` | How a tool input that fails the final check is repaired. `false` turns repair off. A function replaces it. |
| `retry` | Retries a rate-limited model call after the wait the provider asks for, for example `{ maxRetries: 3 }`. |
| `lazyToolsConfig` | How much of each lazy tool description goes into the discovery catalog. See [Lazy Tool Discovery](../tools/lazy-tool-discovery). |
| `mcp` | MCP clients or pools. Their tools join the run. See [MCP](../tools/mcp). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Generic Interrupts](../interrupts/generic). |
| `subagents` | Named child agents from `defineAgent()`. See [Subagents](../chat/subagents). |

Run identity and other options:

| Option | What it does |
| --- | --- |
| `threadId`, `runId`, `parentRunId` | AG-UI ids for the thread, the run, and a parent run. They are made for you when you omit them. |
| `resume` | AG-UI interrupt resume answers, from `chatParamsFromRequest`. |
| `state` | App state put in a `STATE_SNAPSHOT` before an interrupt ends the run. |
| `promptCache` | Automatic prompt caching. Default `"short"`. `"none"` turns it off. See [Prompt Caching](../advanced/prompt-caching). |
| `wrapFetch` | Wraps the fetch of each model call. The adapter must support it. |
| `metadata` | Extra metadata for the request. |
| `debug` | `true`, `false`, or a `DebugConfig`. By default only errors log. See [Debug Logging](../advanced/debug-logging). |

### Returns

By default, `chat()` returns an async iterable of `StreamChunk`. Pass it to a [response helper](#response-helpers).

With `stream: false`, it returns `Promise<ChatResult>`:

- `text`: the full reply as one string.
- `chunks`: every chunk of the run, in order. This includes tool calls, tool results, reasoning, usage, and the `RUN_FINISHED` chunk with any interrupts.

With `outputSchema`, it returns a promise of the parsed object. If the run fails, the promise rejects with the error from `RUN_ERROR`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const { text, chunks } = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "What is the capital of France?" }],
  stream: false,
});

console.log(text);

for (const chunk of chunks) {
  if (chunk.type === "RUN_FINISHED") {
    console.log("Usage:", chunk.usage);
  }
}
```

## `createChatOptions`

Returns `chat()` options unchanged, with full type inference. Use it to define a configuration once and spread it into `chat()`. See [Typed Options](../advanced/typed-options).

```typescript
import { chat, createChatOptions } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const chatOptions = createChatOptions({
  adapter: openaiText("gpt-6.1-sol"),
});

const stream = chat({
  ...chatOptions,
  messages: [{ role: "user", content: "Hello!" }],
});
```

Each activity has a matching helper: `createSummarizeOptions`, `createImageOptions`, `createAudioOptions`, `createVideoOptions`, `createSpeechOptions`, `createVoiceOptions`, `createTranscriptionOptions`, `createEmbedOptions`, `createRerankOptions`, `createWorldOptions`, and `createLiveVideoOptions`.

## `toolDefinition`

Defines a tool once. Then you make a server or a client implementation from it. See [Tools](../tools/tools).

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
});

const getWeather = getWeatherDef.server(async ({ city }) => {
  return { temperature: city.length };
});

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Weather in Paris?" }],
  tools: [getWeather],
});
```

| Field | What it does |
| --- | --- |
| `name` | The tool name. Must be unique in a run. |
| `description` | Tells the model when to use the tool. |
| `inputSchema`, `outputSchema` | Standard Schema (Zod, Valibot, ArkType) or JSON Schema. |
| `needsApproval` | `true` pauses the run for a user decision. See [Tool Approval](../interrupts/tool-approval). |
| `approvalSchema` | The shape of the approve or reject payload. Only with `needsApproval: true`. |
| `lazy` | The model finds the tool through discovery. See [Lazy Tool Discovery](../tools/lazy-tool-discovery). |
| `metadata` | Extra data for your own code. |
| `replay` | `"safe"` lets a host run the tool again after a crash. `"never"` (or no value) does not. |
| `execution` | `"task"` makes an MCP server call return a task handle. See [MCP Server Tasks](../mcp/server-tasks). |

The result has two methods:

- `.server(execute)`: a tool that runs on the server.
- `.client(execute?)`: a tool that runs in the browser. See [Client Tools](../tools/client-tools).

You can also pass the definition itself to `chat()`. Then the client runs it.

`execute` gets the input and a `ToolExecutionContext`. Declare a context type with `.server<AppContext>(...)`. Then `chat()` requires a matching `context`:

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
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    tools: [currentUser],
    context: { userId: session.user.id, db },
  });
  return toServerSentEventsResponse(stream);
}
```

## Agent loop strategies

An agent loop strategy decides, between model turns, if the loop goes on. It gets `{ iterationCount, finishReason, messages, toolCallCount, lastTurnToolCallCount }` and returns `true` to go on. See [Agentic Cycle](../chat/agentic-cycle).

| Function | What it does |
| --- | --- |
| `maxIterations(max)` | Stops after `max` model turns. |
| `untilFinishReason(reasons)` | Stops when the finish reason is in `reasons`. |
| `combineStrategies(strategies)` | Goes on only while every strategy returns `true`. |

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
  agentLoopStrategy: maxIterations(20),
});
```

An iteration is one model turn, not one tool call. One turn can call many tools in parallel. For a tool-call budget, use middleware (`onBeforeToolCall` and `onShouldContinue`). See [Tool-call budgets](../chat/agentic-cycle#tool-call-budgets-middleware-recipe).

A strategy that goes on after a `length` answer makes the model send the [cut tool call](../chat/agentic-cycle#when-the-output-limit-cuts-a-tool-call) again.

## Response helpers

Each helper turns a `chat()` stream into a response for one transport. Pick the one that matches the client connection adapter. See [Transports](../transports/overview).

| Helper | Returns | Client adapter |
| --- | --- | --- |
| `toServerSentEventsResponse(stream, init?)` | `Response` with SSE headers | `fetchServerSentEvents`, `xhrServerSentEvents` |
| `toServerSentEventsStream(stream, abortController?)` | `ReadableStream<Uint8Array>` of SSE events | Same |
| `toHttpResponse(stream, init?)` | `Response` with newline-delimited JSON | `fetchHttpStream`, `xhrHttpStream` |
| `toHttpStream(stream, abortController?)` | `ReadableStream<Uint8Array>` of NDJSON | Same |
| `toJsonResponse(input, init?)` | `Promise<Response>` with one JSON body | `fetchJson` |
| `toWebSocketResponse`, `toWebSocketStream` | WebSocket frames | `webSocket` |

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST() {
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: [{ role: "user", content: "Hello!" }],
  });
  return toServerSentEventsResponse(stream);
}
```

- `toServerSentEventsResponse` sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive`.
- `init` is a `ResponseInit`, plus `abortController` and `durability`. See [Resumable Streams](../resumable-streams/overview).
- Each SSE event is `data: <json>\n\n`. The last event is `RUN_FINISHED` or `RUN_ERROR`.
- `resumeServerSentEventsResponse`, `resumeHttpResponse`, and `resumeJsonResponse` serve a resumed stream from a durable log.

## `chatParamsFromRequest`

`chatParamsFromRequest(req)` reads a `Request`, parses the JSON body, and checks it against the AG-UI `RunAgentInput` schema. You get params ready for `chat()`.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    tools: serverTools,
  });
  return toServerSentEventsResponse(stream);
}
```

It resolves to `{ messages, threadId, runId, parentRunId?, tools, forwardedProps, state, resume?, aguiContext }`.

- `aguiContext` is the AG-UI `RunAgentInput.context` field. It is not the runtime `chat({ context })`. To give these values to tools or middleware, check them and map them yourself.
- On a bad body, it throws a `400` `Response`. TanStack Start, SolidStart, Remix, and React Router 7 return that response for you.

> [!NOTE]
> Next.js route handlers, SvelteKit, Hono, and raw Node do not handle a thrown `Response`. Wrap the call in `try`/`catch`, or use `chatParamsFromRequestBody`.

## `chatParamsFromRequestBody`

`chatParamsFromRequestBody(body)` checks a body that you already parsed. It rejects with an `AGUIError` on a bad body, so you control the error response.

```typescript
import { chatParamsFromRequestBody } from "@tanstack/ai";

export async function POST(req: Request): Promise<Response> {
  try {
    const params = await chatParamsFromRequestBody(await req.json());
    return new Response(`thread ${params.threadId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(message, { status: 400 });
  }
}
```

## `mergeAgentTools`

`mergeAgentTools(serverTools, clientTools)` merges your server tools with the tools that the client declared in the request. See [Client Tools](../tools/client-tools).

```typescript
import {
  chat,
  chatParamsFromRequest,
  mergeAgentTools,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { serverTools } from "./tools";

export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    tools: mergeAgentTools(serverTools, params.tools),
  });
  return toServerSentEventsResponse(stream);
}
```

- `serverTools` is an array of tools.
- `clientTools` is the `tools` array from `chatParamsFromRequest`.
- A server tool wins when both have the same name.
- A client-only tool becomes an entry with no `execute`. The client runs it.
- It returns an array for `chat({ tools })`.

## `streamToText`

`streamToText(stream)` reads a stream to the end and resolves to the same `ChatResult` as `stream: false`: `{ text, chunks }`. It rejects with the error of a `RUN_ERROR` chunk.

## `summarize`

Summarizes text with a summarize adapter.

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-6.1-sol"),
  text: "Long text to summarize...",
  maxLength: 100,
  style: "concise",
});

console.log(result.summary);
```

| Option | What it does |
| --- | --- |
| `adapter` | A summarize adapter with a model. |
| `text` | The text to summarize. |
| `maxLength` | The longest summary you want. |
| `style` | `"bullet-points"`, `"paragraph"`, or `"concise"`. |
| `focus` | Topics to focus on. |
| `stream` | `true` to stream the summary. |
| `modelOptions`, `middleware`, `abortSignal`, `timeout`, `threadId`, `runId`, `debug` | Same meaning as for the other activities. |

It resolves to a `SummarizationResult`: `{ id, model, summary, usage }`.

## `decide`

Asks typed questions about one shared state and returns answers your code can branch on. It is async and does not stream. See [Evaluate](../evaluate/evaluate).

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { typesafeDecider } from "@tanstack/ai-typesafe";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: typesafeDecider("jev-latest"),
  state: ticket,
  questions: {
    queue: choice({
      instructions: "Which team should handle this ticket?",
      options: {
        billing: "Payments, invoices, refunds",
        tech: "Bugs, outages, integrations",
        sales: "Pricing, upgrades, new accounts",
      },
    }),
    urgency: score({
      instructions: "How urgent is this ticket?",
      levels: ["low", "medium", "high"],
    }),
    refund: boolean({
      instructions: "Is the customer asking for a refund?",
    }),
  },
});

console.log(result.queue.value, result.urgency.value, result.refund.value);
```

| Option | What it does |
| --- | --- |
| `adapter` | Required. An evaluate adapter with a model, for example `typesafeDecider("jev-latest")`. |
| `state` | Required. The content that every question judges: a string, an object, or an array. An array is one state, not a batch. |
| `questions` | Required. A map of `choice`, `score`, and `boolean` questions. The key `meta` is reserved. |
| `abortSignal` | Cancels the request. |
| `modelOptions` | Provider options. |
| `middleware` | Observe-only generation middleware. |
| `debug` | Debug logging. |

Question helpers:

- `choice({ instructions, options })`: picks one key from `options`. The answer has `value` (the key), `probability`, `confidence` (0 to 1), and `probabilities`.
- `score({ instructions, levels })`: rates the state on two or more ordered `levels`. The answer has `value` (the nearest level), `score` (the raw fraction), `probability`, `confidence`, `legend` (level index to label), and `probabilities` (by level index).
- `boolean({ instructions, criteria? })`: yes or no. `value` is `true` when `probability` is 0.5 or more. There is no `confidence`.

`result.meta` holds `model` and `usage`. When the adapter returns them, it also holds `id` (the provider response id) and `provider`.

## Generation functions

Each function runs one generation with a matching adapter. The guide for each one shows the server and the client side.

| Function | What it makes | Guide |
| --- | --- | --- |
| `generateImage` | Images | [Image Generation](../media/image-generation) |
| `generateAudio` | Music and sound effects | [Audio Generation](../media/audio-generation) |
| `generateSpeech` | Speech from text | [Text to Speech](../media/text-to-speech) |
| `listVoices`, `generateVoice` | Voice lists and new voices | [Voice Creation](../media/voice-creation) |
| `generateTranscription` | Text from audio | [Transcription](../media/transcription) |
| `generateVideo`, `getVideoJobStatus` | Video jobs and their status | [Video Generation](../media/video-generation) |
| `generateWorld` | 3D worlds | [World Generation](../media/world-generation) |
| `generateLiveVideo` | Live video sessions | [Live Generation](../media/live-generation) |
| `embed` | Embeddings | [Embeddings](../embeddings) |
| `rerank` | Ranked documents | [Rerank](../rerank/rerank) |
| `uploadFile`, `getFile`, `deleteFile`, `fileSourceFromHandle` | Provider file uploads | [Files API](../advanced/files-api) |

## BYOK

Bring Your Own Key helpers. Import them from `@tanstack/ai/byok`. The functions that read `process.env` are on `@tanstack/ai/byok/server`. See [Bring Your Own Key](../advanced/byok).

### `defineByokProvider`

`defineByokProvider({ id, label, env?, with? })` declares a BYOK provider. Adapter packages use it.

```typescript
import { defineByokProvider } from "@tanstack/ai/byok";

export const openaiByok = defineByokProvider({
  id: "openai",
  label: "OpenAI",
  env: "OPENAI_API_KEY",
});
```

| Field | What it does |
| --- | --- |
| `id` | Required. The slug (`[a-z][a-z0-9-]{0,63}`) in the `x-byok-<id>` header. |
| `label` | The display name. |
| `env` | The name of an env var, or a list of names to try in order. Names only: this object is imported on the client, so never put `process.env` values here. |
| `with` | Other descriptors that this credential needs, for example an account id next to a token. A keyring from `defineByok({ providers })` sends and asks for them together. Read them with `getByokKeys`. |

It returns `{ id, label, env?, with? }`, with `id` as a literal type. A string `env` is stored as a one-item array.

Import a descriptor from the adapter `/byok` subpath, for example `openaiByok` from `@tanstack/ai-openai/byok`. The adapter main entry pulls in the provider SDK.

### `getByokKey`

`getByokKey(request, provider)` reads a key on your relay route. It works in any API route. Import it from `@tanstack/ai/byok/server`.

```typescript
import { getByokKey } from "@tanstack/ai/byok/server";
import { openaiByok } from "@tanstack/ai-openai/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, openaiByok);
  return new Response(apiKey ? "ok" : "missing");
}
```

- `provider` is a `ByokProvider` or a slug.
- The `x-byok-<slug>` header wins.
- Then a `ByokProvider` tries its `env` names in order. A slug reads only the header.
- It returns `null` when nothing is found. It never reads the JSON body.

### `getByokKeys`

`getByokKeys(request, providers)` reads several keys at once. When one credential has more than one value, use it. Each entry follows the `getByokKey` rules.

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

It returns an object with the same keys, each `string | null`.

### `byokMissing`

`byokMissing(provider)` returns a `401` JSON `Response`: `{ error: { type: "byok_missing", provider, message } }`. The chat and generation clients read this body and set `snapshot.prompt`. Import it from `@tanstack/ai/byok` or `@tanstack/ai/byok/server`.

```typescript
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { openaiByok } from "@tanstack/ai-openai/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);
  return new Response("ok");
}
```

### `maskKey`

`maskKey(key)` returns the last four characters of a key. A key of four characters or fewer becomes `"••"`.

```typescript
import { maskKey } from "@tanstack/ai/byok";

maskKey("sk-abcdefghij"); // "ghij"
```

### `scrubSecrets`

`scrubSecrets(input, secrets)` replaces each secret in `input` with `[redacted]`. Use it before you log an error string.

```typescript
import { scrubSecrets } from "@tanstack/ai/byok";

scrubSecrets("failed sk-live extra", ["sk-live"]);
// "failed [redacted] extra"
```

### Keyed adapters

`keyedAdapter`, `keyedAdapters`, and `keyedAdapterFromRequest` (server) build the adapter of the first provider that has a key. `keyedAdapterFromRequest` returns `null` when no provider has a key, so the route can answer with `byokMissing`. See [Bring Your Own Key](../advanced/byok).

## Other exports

The package exports more building blocks. Each group has a guide.

| Group | Main exports | Guide |
| --- | --- | --- |
| Middleware | `defineChatMiddleware`, `createChatMiddleware`, capabilities | [Middleware](../advanced/middleware-advanced) |
| Interrupts | `defineInterrupt` | [Generic Interrupts](../interrupts/generic) |
| Subagents | `defineAgent`, `subagentRoute`, `runAgentStream` | [Subagents](../chat/subagents), [Subagents: Advanced](../chat/subagents-advanced) |
| Durable streams | `memoryStream`, `replayRunStream` | [Resumable Streams](../resumable-streams/overview) |
| Run cancel | `requestRunCancel`, `wasCancelRequested` | [Takeover](../sandbox/takeover) |
| Custom adapters | `extendAdapter`, `createModel` | [Extend an Adapter](../advanced/extend-adapter) |
| Realtime | `realtimeToken` | [Realtime Chat](../media/realtime-chat) |
| Message converters | `convertMessagesToModelMessages`, `uiMessageToModelMessages`, `modelMessagesToUIMessages` | [Generated reference](../reference/index) |

Subpath entries:

| Subpath | What it holds | Guide |
| --- | --- | --- |
| `@tanstack/ai/middlewares` | Built-in middleware | [Built-in Middleware](../advanced/built-in-middleware) |
| `@tanstack/ai/middlewares/otel` | OpenTelemetry middleware | [OpenTelemetry](../advanced/otel) |
| `@tanstack/ai/locks` | Locks across instances | [Locks](../advanced/locks) |
| `@tanstack/ai/testing` | Test helpers | [Testing](../advanced/testing) |
| `@tanstack/ai/adapters`, `@tanstack/ai/adapter-internals` | Base classes for adapter authors | [Community Adapters](../community-adapters/guide) |
| `@tanstack/ai/client` | Browser-safe types and helpers | [`@tanstack/ai-client`](./ai-client) |

## Types

Each type links to its full definition in the generated reference.

| Type | What it is |
| --- | --- |
| [`ModelMessage`](../reference/interfaces/ModelMessage) | A message in model format: `role` (`"user"`, `"assistant"`, or `"tool"`), `content`, `toolCalls`, `toolCallId`, `thinking`, and more. |
| [`StreamChunk`](../reference/type-aliases/StreamChunk) | One AG-UI event: `RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `RUN_FINISHED`, `RUN_ERROR`, and the others. See [Stream Events](../chat/stream-events). |
| [`Tool`](../reference/interfaces/Tool) | A tool: `name`, `description`, `inputSchema`, `outputSchema`, `execute`, `needsApproval`, `lazy`, `metadata`. |
| [`ToolExecutionContext`](../reference/type-aliases/ToolExecutionContext) | The second argument of `execute`: `context`, `toolCallId`, `threadId`, `abortSignal`, `emitCustomEvent`, and more. `threadId` is the thread id of the chat run, so a tool can keep its own state for each conversation. |
| [`ChatMiddleware`](../reference/interfaces/ChatMiddleware) | Middleware hooks: `onConfig`, `onStart`, `onChunk`, `onBeforeToolCall`, `onAfterToolCall`, `onShouldContinue`, `onFinish`, `onAbort`, `onError`, and more. See [Middleware](../advanced/middleware). |

In a tool, `context` is the value from `chat({ context })`. In a client tool, it comes from the `ChatClient` or hook options. It is required when the tool declares a context type.
