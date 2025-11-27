---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L231)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TOutput

`TOutput` *extends* [`ResponseFormat`](../ResponseFormat.md)\<`any`\> \| `undefined` = `undefined`

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

## Properties

### abortController?

```ts
optional abortController: AbortController;
```

Defined in: [types.ts:259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L259)

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

Defined in: [types.ts:241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L241)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L238)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L237)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:242](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L242)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L245)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L243)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:244](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L244)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L240)

***

### tools?

```ts
optional tools: Tool[];
```

Defined in: [types.ts:239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L239)
