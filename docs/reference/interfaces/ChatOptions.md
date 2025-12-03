---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L469)

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

Defined in: [types.ts:497](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L497)

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

Defined in: [types.ts:479](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L479)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:476](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L476)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:475](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L475)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:480](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L480)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:483](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L483)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:481](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L481)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:482](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L482)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:478](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L478)

***

### tools?

```ts
optional tools: Tool<ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, string>[];
```

Defined in: [types.ts:477](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L477)
