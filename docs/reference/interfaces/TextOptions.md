---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel, TContext\>

Defined in: [packages/ai/src/types.ts:969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L969)

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

Defined in: [packages/ai/src/types.ts:1069](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1069)

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

Defined in: [packages/ai/src/types.ts:997](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L997)

***

### approvals?

```ts
optional approvals?: ReadonlyMap<string, boolean>;
```

Defined in: [packages/ai/src/types.ts:1121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1121)

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

Defined in: [packages/ai/src/types.ts:1112](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1112)

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

Defined in: [packages/ai/src/types.ts:981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L981)

Runtime context provided by the caller and passed to middleware and
server-side tool implementations.

***

### ~~conversationId?~~

```ts
optional conversationId?: string;
```

Defined in: [packages/ai/src/types.ts:1055](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1055)

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

Defined in: [packages/ai/src/types.ts:1003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1003)

Optional configuration for lazy-tool discovery (tools marked `lazy: true`).
Tunes how much of each lazy tool's description appears in the discovery
catalog. Optional — defaults to `{ includeDescription: 'none' }`.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1076)

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

Defined in: [packages/ai/src/types.ts:975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L975)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1014)

Observability metadata attached to this call. Surfaced to middleware,
devtools, and the event client; values may be arbitrarily structured
(objects, arrays). Adapters never forward this field onto the provider
wire request.

To send provider-side request metadata, use the provider's
`modelOptions` field instead, where the provider supports one (e.g.
OpenAI's and OpenRouter's `metadata` are both Record<string, string>).

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:974](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L974)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptionsForModel;
```

Defined in: [packages/ai/src/types.ts:1015](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1015)

***

### outputSchema?

```ts
optional outputSchema?: SchemaInput;
```

Defined in: [packages/ai/src/types.ts:1044](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1044)

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

Defined in: [packages/ai/src/types.ts:1093](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1093)

Parent run ID for AG-UI protocol nested run correlation.
Surfaced for observability/middleware; not consumed by the LLM call.

***

### request?

```ts
optional request?: Request | RequestInit;
```

Defined in: [packages/ai/src/types.ts:1016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1016)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/types.ts:1102](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1102)

AG-UI interrupt resume responses supplied by the client on a follow-up run.
A first-party generic item carries the original request in `metadata`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1088](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1088)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### state?

```ts
optional state?: unknown;
```

Defined in: [packages/ai/src/types.ts:1096](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1096)

Application state mirrored in a STATE_SNAPSHOT before an interrupt terminal.

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:996](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L996)

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

Defined in: [packages/ai/src/types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1082)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### tools?

```ts
optional tools?: AnyTool[];
```

Defined in: [packages/ai/src/types.ts:976](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L976)
