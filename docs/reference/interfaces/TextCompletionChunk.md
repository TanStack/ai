---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1470)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1473](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1473)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1475](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1475)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1471)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1472)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1474](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1474)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1476)

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
