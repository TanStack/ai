---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel\>

Defined in: [packages/typescript/ai/src/types.ts:657](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L657)

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

Defined in: [packages/typescript/ai/src/types.ts:741](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L741)

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

Defined in: [packages/typescript/ai/src/types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:727](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L727)

Conversation ID for correlating client and server-side devtools events.
When provided, server-side events will be linked to the client conversation in devtools.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

Internal logger threaded from the chat entry point. Adapter implementations
must call `logger.request()` before SDK calls, `logger.provider()` for each
chunk received, and `logger.errors()` in catch blocks.

***

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/types.ts:700](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L700)

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

Defined in: [packages/typescript/ai/src/types.ts:662](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L662)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [packages/typescript/ai/src/types.ts:711](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L711)

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

Defined in: [packages/typescript/ai/src/types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [packages/typescript/ai/src/types.ts:712](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L712)

***

### outputSchema?

```ts
optional outputSchema: SchemaInput;
```

Defined in: [packages/typescript/ai/src/types.ts:722](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L722)

Schema for structured output.
When provided, the adapter should use the provider's native structured output API
to ensure the response conforms to this schema.
The schema will be converted to JSON Schema format before being sent to the provider.
Supports any Standard JSON Schema compliant library (Zod, ArkType, Valibot, etc.).

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [packages/typescript/ai/src/types.ts:713](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L713)

***

### runId?

```ts
optional runId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:760](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L760)

Run ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.
If not provided, a unique ID will be generated.

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/types.ts:678](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L678)

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

Defined in: [packages/typescript/ai/src/types.ts:754](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L754)

Thread ID for AG-UI protocol run correlation.
When provided, this will be used in RunStartedEvent and RunFinishedEvent.

***

### tools?

```ts
optional tools: Tool<any, any, any>[];
```

Defined in: [packages/typescript/ai/src/types.ts:663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L663)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/types.ts:691](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L691)

Nucleus sampling parameter. An alternative to temperature sampling.
The model considers the results of tokens with topP probability mass.
For example, 0.1 means only tokens comprising the top 10% probability mass are considered.

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `text.top_p` (number)
- Anthropic: `top_p` (number | null)
- Gemini: `generationConfig.topP` (number)
