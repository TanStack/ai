---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel\>

Defined in: [types.ts:516](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L516)

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

Defined in: [types.ts:549](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L549)

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

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:535](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L535)

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

Defined in: [types.ts:523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L523)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L522)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:527](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L527)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:530](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L530)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:528](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L528)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L529)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

***

### tools?

```ts
optional tools: Tool<StandardSchemaV1<unknown, unknown>, StandardSchemaV1<unknown, unknown>, string>[];
```

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)
