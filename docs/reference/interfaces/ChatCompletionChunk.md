---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L376)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:379](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L379)

***

### finishReason?

```ts
optional finishReason: "stop" | "length" | "content_filter" | null;
```

Defined in: [types.ts:381](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L381)

***

### id

```ts
id: string;
```

Defined in: [types.ts:377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L377)

***

### model

```ts
model: string;
```

Defined in: [types.ts:378](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L378)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L380)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L382)

#### completionTokens

```ts
completionTokens: number;
```

#### promptTokens

```ts
promptTokens: number;
```

#### totalTokens

```ts
totalTokens: number;
```
