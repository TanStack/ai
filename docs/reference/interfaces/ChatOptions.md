---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:246](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L246)

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

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

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

Defined in: [types.ts:256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L256)

***

### messages

```ts
messages: ModelMessage[];
```

Defined in: [types.ts:253](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L253)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L252)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:257](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L257)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L260)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:258](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L258)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L259)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:255](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L255)

***

### tools?

```ts
optional tools: Tool<ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>>[];
```

Defined in: [types.ts:254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L254)
