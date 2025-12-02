---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L300)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TOutput

`TOutput` *extends* [`ResponseFormat`](./ResponseFormat.md)\<`any`\> \| `undefined` = `undefined`

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

## Properties

### abortController?

```ts
optional abortController: AbortController;
```

Defined in: [types.ts:328](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L328)

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

Defined in: [types.ts:310](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L310)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:307](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L307)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L306)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:311](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L311)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L314)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L312)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L313)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:309](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L309)

***

### tools?

```ts
optional tools: Tool<ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, string>[];
```

Defined in: [types.ts:308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L308)
