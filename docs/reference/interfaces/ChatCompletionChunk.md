---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:600](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L600)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:603](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L603)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L605)

***

### id

```ts
id: string;
```

Defined in: [types.ts:601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L601)

***

### model

```ts
model: string;
```

Defined in: [types.ts:602](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L602)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:604](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L604)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:606](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L606)

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
