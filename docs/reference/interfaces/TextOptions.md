---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel\>

Defined in: [types.ts:597](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L597)

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

Defined in: [types.ts:681](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L681)

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

Defined in: [types.ts:605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L605)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:667](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L667)

Conversation ID for correlating client and server-side devtools events.
When provided, server-side events will be linked to the client conversation in devtools.

***

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [types.ts:640](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L640)

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

Defined in: [types.ts:602](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L602)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:651](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L651)

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

Defined in: [types.ts:601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L601)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:652](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L652)

***

### outputSchema?

```ts
optional outputSchema: SchemaInput;
```

Defined in: [types.ts:662](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L662)

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

Defined in: [types.ts:653](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L653)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:604](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L604)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [types.ts:618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L618)

Controls the randomness of the output.
Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused and deterministic.
Range: [0.0, 2.0]

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `temperature` (number) - in text.top_p field
- Anthropic: `temperature` (number) - ranges from 0.0 to 1.0, default 1.0
- Gemini: `generationConfig.temperature` (number) - ranges from 0.0 to 2.0

***

### tools?

```ts
optional tools: Tool<any, any, any>[];
```

Defined in: [types.ts:603](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L603)

***

### topP?

```ts
optional topP: number;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Nucleus sampling parameter. An alternative to temperature sampling.
The model considers the results of tokens with topP probability mass.
For example, 0.1 means only tokens comprising the top 10% probability mass are considered.

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `text.top_p` (number)
- Anthropic: `top_p` (number | null)
- Gemini: `generationConfig.topP` (number)
