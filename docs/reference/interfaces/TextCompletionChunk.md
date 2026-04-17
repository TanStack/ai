---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:980](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L980)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:983](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L983)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:985](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L985)

***

### id

```ts
id: string;
```

Defined in: [types.ts:981](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L981)

***

### model

```ts
model: string;
```

Defined in: [types.ts:982](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L982)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:984](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L984)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:986](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L986)

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
