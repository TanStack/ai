---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel\>

Defined in: [packages/typescript/ai/src/types.ts:685](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L685)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

## Properties

### abortController?

```ts
optional abortController: AbortController;
```

Defined in: [packages/typescript/ai/src/types.ts:775](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L775)

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

Defined in: [packages/typescript/ai/src/types.ts:693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L693)

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:761](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L761)

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

Defined in: [packages/typescript/ai/src/types.ts:782](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L782)

Internal logger threaded from the chat entry point. Adapter implementations
must call `logger.request()` before SDK calls, `logger.provider()` for each
chunk received, and `logger.errors()` in catch blocks.

***

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/types.ts:728](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L728)

The maximum number of tokens to generate in the response.

Provider usage:
- OpenAI: `max_output_tokens` (number) - includes visible output and reasoning tokens
- Anthropic: `max_tokens` (number, required) - range x >= 1
- Gemini: `generationConfig.maxOutputTokens` (number)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [packages/typescript/ai/src/types.ts:739](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L739)

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

Defined in: [packages/typescript/ai/src/types.ts:689](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L689)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [packages/typescript/ai/src/types.ts:740](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L740)

***

### outputSchema?

```ts
optional outputSchema: SchemaInput;
```

Defined in: [packages/typescript/ai/src/types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

Schema for structured output.
When provided, the adapter should use the provider's native structured output API
to ensure the response conforms to this schema.
The schema will be converted to JSON Schema format before being sent to the provider.
Supports any Standard JSON Schema compliant library (Zod, ArkType, Valibot, etc.).

***

### parentRunId?

```ts
optional parentRunId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:799](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L799)

Parent run ID for AG-UI protocol nested run correlation.
Surfaced for observability/middleware; not consumed by the LLM call.

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [packages/typescript/ai/src/types.ts:741](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L741)

***

### runId?

```ts
optional runId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:794](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L794)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/types.ts:706](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L706)

Controls the randomness of the output.
Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused and deterministic.
Range: [0.0, 2.0]

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `temperature` (number) - in text.top_p field
- Anthropic: `temperature` (number) - ranges from 0.0 to 1.0, default 1.0
- Gemini: `generationConfig.temperature` (number) - ranges from 0.0 to 2.0

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:788](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L788)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### tools?

```ts
optional tools: Tool<any, any, any>[];
```

Defined in: [packages/typescript/ai/src/types.ts:691](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L691)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/types.ts:719](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L719)

Nucleus sampling parameter. An alternative to temperature sampling.
The model considers the results of tokens with topP probability mass.
For example, 0.1 means only tokens comprising the top 10% probability mass are considered.

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `text.top_p` (number)
- Anthropic: `top_p` (number | null)
- Gemini: `generationConfig.topP` (number)
