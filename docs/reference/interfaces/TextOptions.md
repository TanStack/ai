---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel, TContext\>

Defined in: [packages/ai/src/types.ts:850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L850)

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
optional abortController: AbortController;
```

Defined in: [packages/ai/src/types.ts:947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L947)

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
optional agentLoopStrategy: AgentLoopStrategy;
```

Defined in: [packages/ai/src/types.ts:878](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L878)

***

### approvals?

```ts
optional approvals: ReadonlyMap<string, boolean>;
```

Defined in: [packages/ai/src/types.ts:990](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L990)

Client approval decisions for this run, keyed by approval id. The engine
populates this from approvals carried on the incoming messages. Harness
adapters consult it to resolve `ask`-policy permission requests (the agent
pauses on a risky action; the client re-runs with a decision recorded
here). Undefined for direct adapter usage outside the chat engine.

***

### capabilities?

```ts
optional capabilities: CapabilityContext;
```

Defined in: [packages/ai/src/types.ts:981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L981)

Middleware capability context for this run. The engine populates it with
the live middleware context so harness adapters that declare
`requires: [SomeCapability]` can read provided capabilities from inside
`chatStream` — e.g. `getSandbox(options.capabilities)`. Capabilities are
provisioned by middleware `setup` before the adapter runs. Undefined for
direct adapter usage outside the chat engine.

***

### context?

```ts
optional context: TContext;
```

Defined in: [packages/ai/src/types.ts:862](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L862)

Runtime context provided by the caller and passed to middleware and
server-side tool implementations.

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/ai/src/types.ts:933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L933)

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
optional lazyToolsConfig: LazyToolsConfig;
```

Defined in: [packages/ai/src/types.ts:884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L884)

Optional configuration for lazy-tool discovery (tools marked `lazy: true`).
Tunes how much of each lazy tool's description appears in the discovery
catalog. Optional — defaults to `{ includeDescription: 'none' }`.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L954)

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

Defined in: [packages/ai/src/types.ts:856](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L856)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:895](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L895)

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

Defined in: [packages/ai/src/types.ts:855](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L855)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [packages/ai/src/types.ts:896](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L896)

***

### outputSchema?

```ts
optional outputSchema: SchemaInput;
```

Defined in: [packages/ai/src/types.ts:922](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L922)

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
   `output_format`) alongside any `tools`. The model's natural final
   turn carries the schema-constrained JSON text and the engine
   harvests it from the agent loop without a separate finalization
   round-trip.

   Adapters that did NOT declare the capability never see this field
   populated — the engine instead invokes `structuredOutput` /
   `structuredOutputStream` after the agent loop.

***

### parentRunId?

```ts
optional parentRunId: string;
```

Defined in: [packages/ai/src/types.ts:971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L971)

Parent run ID for AG-UI protocol nested run correlation.
Surfaced for observability/middleware; not consumed by the LLM call.

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [packages/ai/src/types.ts:897](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L897)

***

### runId?

```ts
optional runId: string;
```

Defined in: [packages/ai/src/types.ts:966](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L966)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### systemPrompts?

```ts
optional systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:877](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L877)

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
optional threadId: string;
```

Defined in: [packages/ai/src/types.ts:960](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L960)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### tools?

```ts
optional tools: AnyTool[];
```

Defined in: [packages/ai/src/types.ts:857](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L857)
