---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:548](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L548)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

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

Defined in: [types.ts:581](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L581)

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

Defined in: [types.ts:558](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L558)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

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

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:554](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L554)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:562](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L562)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:560](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L560)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:561](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L561)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

***

### tools?

```ts
optional tools: Tool<any, any, any>[];
```

Defined in: [types.ts:556](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L556)
