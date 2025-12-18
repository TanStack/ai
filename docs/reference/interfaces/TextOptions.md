---
id: TextOptions
title: TextOptions
---

# Interface: TextOptions\<TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L605)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TOutput

`TOutput` *extends* [`ResponseFormat`](ResponseFormat.md)\<`any`\> \| `undefined` = `undefined`

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

## Properties

### abortController?

```ts
optional abortController: AbortController;
```

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

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

Defined in: [types.ts:614](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L614)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L630)

Conversation ID for correlating client and server-side devtools events.
When provided, server-side events will be linked to the client conversation in devtools.

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:611](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L611)

***

### model

```ts
model: string;
```

Defined in: [types.ts:610](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L610)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:616](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L616)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:615](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L615)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L618)

***

### outputSchema?

```ts
optional outputSchema: ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>;
```

Defined in: [types.ts:625](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L625)

Zod schema for structured output.
When provided, the adapter should use the provider's native structured output API
to ensure the response conforms to this schema.
The schema will be converted to JSON Schema format before being sent to the provider.

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:617](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L617)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:613](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L613)

***

### tools?

```ts
optional tools: Tool<any, any, any>[];
```

Defined in: [types.ts:612](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L612)
