---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1161)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1164](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1164)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1166)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1162](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1162)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1163)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1165)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1167)

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
