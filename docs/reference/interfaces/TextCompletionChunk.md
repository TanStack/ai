---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1367)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1370)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1372](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1372)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1368)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1369)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1371](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1371)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1373](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1373)

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
