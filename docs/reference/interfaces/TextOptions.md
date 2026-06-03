---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel, TContext\>

Defined in: [packages/ai/src/types.ts:786](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L786)

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

Defined in: [packages/ai/src/types.ts:877](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L877)

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

Defined in: [packages/ai/src/types.ts:814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L814)

***

### context?

```ts
optional context: TContext;
```

Defined in: [packages/ai/src/types.ts:798](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L798)

Runtime context provided by the caller and passed to middleware and
server-side tool implementations.

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/ai/src/types.ts:863](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L863)

#### Deprecated

Use `threadId` instead. `conversationId` is the legacy
pre-AG-UI name for the same concept (a stable per-conversation
identifier used to correlate client/server devtools events). When
`conversationId` is omitted, the runtime falls back to `threadId`
automatically, so most callers can simply pass `threadId` (or rely
on `chatParamsFromRequest`, which surfaces it on `params`).

Will be removed in a future major release.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L884)

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

Defined in: [packages/ai/src/types.ts:792](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L792)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L825)

Additional metadata to attach to the request.
Can be used for tracking, debugging, or passing custom information.
Structure and constraints vary by provider.

Provider usage:
- OpenAI: `metadata` (Record<string, string>) - max 16 key-value pairs, keys max 64 chars, values max 512 chars
- Anthropic: `metadata` (Record<string, any>) - includes optional user_id (max 256 chars)
- Gemini: Not directly available in TextProviderOptions

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:791](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L791)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [packages/ai/src/types.ts:826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L826)

***

### outputSchema?

```ts
optional outputSchema: SchemaInput;
```

Defined in: [packages/ai/src/types.ts:852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L852)

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

Defined in: [packages/ai/src/types.ts:901](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L901)

Parent run ID for AG-UI protocol nested run correlation.
Surfaced for observability/middleware; not consumed by the LLM call.

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [packages/ai/src/types.ts:827](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L827)

***

### runId?

```ts
optional runId: string;
```

Defined in: [packages/ai/src/types.ts:896](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L896)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### systemPrompts?

```ts
optional systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L813)

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

Defined in: [packages/ai/src/types.ts:890](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L890)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### tools?

```ts
optional tools: AnyTool[];
```

Defined in: [packages/ai/src/types.ts:793](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L793)
