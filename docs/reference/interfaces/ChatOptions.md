---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:471](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L471)

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

Defined in: [types.ts:499](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L499)

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

Defined in: [types.ts:481](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L481)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:478](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L478)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:477](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L477)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:482](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L482)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:485](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L485)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:483](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L483)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:484](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L484)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:480](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L480)

***

### tools?

```ts
optional tools: Tool<ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, string>[];
```

Defined in: [types.ts:479](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L479)
