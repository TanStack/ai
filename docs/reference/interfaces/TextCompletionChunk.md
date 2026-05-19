---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1363)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1366](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1366)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1368)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1364)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1365)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1367)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1369)

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
