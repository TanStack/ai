---
id: TextOptions
title: TextOptions
---

Defined in: [packages/ai/src/types.ts:1299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1299)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

### TContext

`TContext` = `unknown`

## Properties

### abortController?

```ts
optional abortController?: AbortController;
```

Defined in: [packages/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1438)

AbortController for request cancellation.

Allows you to cancel an in-progress request using an AbortController.
Useful for implementing timeouts or user-initiated cancellations.

#### Example

```ts
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 5000); // Cancel after 5 seconds
await chat({ ..., abortController });
```

#### See

https://developer.mozilla.org/en-US/docs/Web/API/AbortController

***

### agentLoopStrategy?

```ts
optional agentLoopStrategy?: AgentLoopStrategy;
```

Defined in: [packages/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1327)

***

### approvals?

```ts
optional approvals?: ReadonlyMap<string, boolean>;
```

Defined in: [packages/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1530)

Client approval decisions for this run, keyed by approval id. The engine
populates this from approvals carried on the incoming messages. Harness
adapters consult it to resolve `ask`-policy permission requests (the agent
pauses on a risky action; the client re-runs with a decision recorded
here). Undefined for direct adapter usage outside the chat engine.

***

### capabilities?

```ts
optional capabilities?: CapabilityContext;
```

Defined in: [packages/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1521)

Middleware capability context for this run. The engine populates it with
the live middleware context so harness adapters that declare
`requires: [SomeCapability]` can read provided capabilities from inside
`chatStream` — e.g. `getSandbox(options.capabilities)`. Capabilities are
provisioned by middleware `setup` before the adapter runs. Undefined for
direct adapter usage outside the chat engine.

***

### context?

```ts
optional context?: TContext;
```

Defined in: [packages/ai/src/types.ts:1311](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1311)

Runtime context provided by the caller and passed to middleware and
server-side tool implementations.

***

### ~~conversationId?~~

```ts
optional conversationId?: string;
```

Defined in: [packages/ai/src/types.ts:1424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1424)

#### Deprecated

Use `threadId` instead. `conversationId` is the legacy
pre-AG-UI name for the same concept (a stable per-conversation
identifier used to correlate client/server devtools events). When
`conversationId` is omitted, the runtime falls back to `threadId`
automatically, so most callers can simply pass `threadId` (or rely
on `chatParamsFromRequest`, which surfaces it on `params`).

Will be removed in a future major release.

***

### lazyToolsConfig?

```ts
optional lazyToolsConfig?: LazyToolsConfig;
```

Defined in: [packages/ai/src/types.ts:1365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1365)

Optional configuration for lazy-tool discovery (tools marked `lazy: true`).
Tunes how much of each lazy tool's description appears in the discovery
catalog. Optional — defaults to `{ includeDescription: 'none' }`.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1445)

Internal logger threaded from the chat entry point. Adapter implementations
must call `logger.request()` before SDK calls, `logger.provider()` for each
chunk received, and `logger.errors()` in catch blocks.

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1305](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1305)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1376)

Observability metadata attached to this call. Surfaced to middleware,
devtools, and the event client; values may be arbitrarily structured
(objects, arrays). Adapters never forward this field onto the provider
wire request.

To send provider-side request metadata, use the provider's
`modelOptions` field instead, where the provider supports one (e.g.
OpenAI's and OpenRouter's `metadata` are both Record<string, string>).

***

### midConversationChanges?

```ts
optional midConversationChanges?: MidConversationChanges;
```

Defined in: [packages/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1486)

The tools and system prompts that changed between model calls. The
engine sets it only when `adapter.midConversationChannels` has a channel
that is on. `tools` and `systemPrompts` stay the full current lists, so
an adapter that ignores this field sends the same request as before.
Adapters resolve it with `splitMidConversationChanges`.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1304](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1304)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptionsForModel;
```

Defined in: [packages/ai/src/types.ts:1377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1377)

***

### outputSchema?

```ts
optional outputSchema?: SchemaInput;
```

Defined in: [packages/ai/src/types.ts:1413](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1413)

Schema for structured output.

**Two distinct use sites:**

1. **User-facing (activity layer):** accepts any
   [SchemaInput](../type-aliases/SchemaInput.md) — Zod, ArkType, Valibot, or a raw JSON Schema.
   The activity layer converts to JSON Schema before handing off.

2. **Adapter-facing (`chatStream` call):** the engine populates this with
   a pre-converted JSON Schema **only** when the adapter declared
   `supportsCombinedToolsAndSchema(modelOptions) === true`. The adapter
   should then wire the schema into the upstream request (e.g.
   `response_format: { type: 'json_schema', ... }`, `text.format`,
   `output_format`, `--json-schema`) alongside any `tools`.

   How the engine then takes the object depends on
   `combinedStructuredOutputSource()`:
   - `'text'` (default): the final-turn assistant text is the JSON.
   - `'event'`: the adapter emits `structured-output.complete` during
     `chatStream`. Accumulated prose is not parsed.

   Adapters that did NOT declare the capability never see this field
   populated — the engine instead invokes `structuredOutput` /
   `structuredOutputStream` after the agent loop.

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

Parent run ID for AG-UI protocol nested run correlation.
Surfaced for observability/middleware; not consumed by the LLM call.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:1502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1502)

The subagentRunId of the child that started this one, for a nested child.
Middleware reads it as `ctx.parentSubagentRunId`.

***

### promptCache?

```ts
optional promptCache?: ResolvedPromptCache;
```

Defined in: [packages/ai/src/types.ts:1456](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1456)

Automatic prompt caching for this request. `chat()` sets it. When it is
absent, the adapter adds no automatic cache fields.

***

### reasoning?

```ts
optional reasoning?: ReasoningRequest;
```

Defined in: [packages/ai/src/types.ts:1384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1384)

How hard the model thinks, normalized by `chat()`. `undefined`: the user
did not ask, so the adapter sends nothing and the provider default applies.
The adapter clamps the level to the model's levels and writes its own
wire field.

***

### repairToolInput?

```ts
optional repairToolInput?: false | ((context) => unknown);
```

Defined in: [packages/ai/src/types.ts:1340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1340)

How a tool input that fails the final check is repaired. By default,
common model mistakes such as `"5"` for a number are repaired against the
schema. `false` turns the repair off. A function replaces the built-in
repair: it returns the input to check again, or `undefined` to send the
validation error to the model.

***

### request?

```ts
optional request?: Request | RequestInit;
```

Defined in: [packages/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1385)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/types.ts:1511](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1511)

AG-UI interrupt resume responses supplied by the client on a follow-up run.
A first-party generic item carries the original request in `metadata`.

***

### retry?

```ts
optional retry?: object;
```

Defined in: [packages/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1350)

Retry a model call when the provider error has a wait time (usually a
429). `chat()` waits for the `retryAfterMs` time of the `RUN_ERROR`, then
calls the model again. It retries only when the wait time is at most
`maxWaitMs` and the call has streamed no output yet. The structured-output
call is not retried. Off by default.

#### maxRetries

```ts
maxRetries: number;
```

Extra model calls after the first, for each model call of the run. `0`
means no retry. The provider SDK does its own retries first, from the
`maxRetries` of the adapter config.

#### maxWaitMs?

```ts
optional maxWaitMs?: number;
```

Longest wait time to accept, in milliseconds. Default 60 000.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1462)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### state?

```ts
optional state?: unknown;
```

Defined in: [packages/ai/src/types.ts:1505](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1505)

Application state mirrored in a STATE_SNAPSHOT before an interrupt terminal.

***

### subagentName?

```ts
optional subagentName?: string;
```

Defined in: [packages/ai/src/types.ts:1497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1497)

The agent name when this chat runs as a subagent. Middleware reads it as
`ctx.subagentName`.

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1492)

AG-UI subagent run id when this chat runs as a child of another run.
A child `chat()` passes `ctx.subagentRunId`. Middleware reads it as
`ctx.subagentRunId`. Absent on a top-level run.

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1326](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1326)

System prompts to include with the request.

Accepts plain strings (the common case) or `{ content, metadata }`
objects that let providers attach typed metadata (e.g. Anthropic
`cache_control` for prompt caching) per prompt. At the chat call site
the adapter narrows `metadata`'s type via `~types['systemPromptMetadata']`
— providers that don't declare one default to `never`, which makes the
field carry no meaningful value (TypeScript will only accept
`undefined` there). Provider-foreign metadata that reaches an adapter
via JS / `as any` is silently dropped, never written to the wire.

#### See

SystemPrompt

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1451)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### toolChoice?

```ts
optional toolChoice?: ToolChoice<string>;
```

Defined in: [packages/ai/src/types.ts:1472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1472)

How the model uses the tools of this request. `chat()` sets it only when
the request has tools. A provider value in `modelOptions` wins over it.

***

### toolExecution?

```ts
optional toolExecution?: "parallel" | "sequential";
```

Defined in: [packages/ai/src/types.ts:1332](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1332)

How the server tools of one model turn run. `'parallel'` (the default)
starts them together, and `'sequential'` runs them one at a time.

***

### tools?

```ts
optional tools?: AnyTool[];
```

Defined in: [packages/ai/src/types.ts:1306](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1306)

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1478)

Wraps the fetch of this request. The engine composes the `chat()` option
and the middleware wrappers into one function. An adapter that supports
it calls `wrapFetch(baseFetch)` and sends the request with the result.
