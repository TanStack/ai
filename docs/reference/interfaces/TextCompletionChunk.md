---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1269](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1269)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1272](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1272)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1274)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1270](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1270)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1271)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1273](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1273)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1275)

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
