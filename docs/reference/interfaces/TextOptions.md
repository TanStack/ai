---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TProviderOptionsForModel\>

Defined in: [types.ts:545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L545)

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

Defined in: [types.ts:628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L628)

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

Defined in: [types.ts:553](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L553)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:614](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L614)

Conversation ID for correlating client and server-side devtools events.
When provided, server-side events will be linked to the client conversation in devtools.

***

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [types.ts:588](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L588)

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

Defined in: [types.ts:550](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L550)

***

### metadata?

```ts
optional metadata: Record<string, any>;
```

Defined in: [types.ts:599](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L599)

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

Defined in: [types.ts:549](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L549)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:600](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L600)

***

### outputSchema?

```ts
optional outputSchema: ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>;
```

Defined in: [types.ts:609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L609)

Zod schema for structured output.
When provided, the adapter should use the provider's native structured output API
to ensure the response conforms to this schema.
The schema will be converted to JSON Schema format before being sent to the provider.

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L601)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:552](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L552)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

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

Defined in: [types.ts:551](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L551)

***

### topP?

```ts
optional topP: number;
```

Defined in: [types.ts:579](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L579)

Nucleus sampling parameter. An alternative to temperature sampling.
The model considers the results of tokens with topP probability mass.
For example, 0.1 means only tokens comprising the top 10% probability mass are considered.

Note: Generally recommended to use either temperature or topP, but not both.

Provider usage:
- OpenAI: `text.top_p` (number)
- Anthropic: `top_p` (number | null)
- Gemini: `generationConfig.topP` (number)
