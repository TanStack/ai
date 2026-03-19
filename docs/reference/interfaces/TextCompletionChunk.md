---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:973](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L973)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:976](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L976)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:978](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L978)

***

### id

```ts
id: string;
```

Defined in: [types.ts:974](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L974)

***

### model

```ts
model: string;
```

Defined in: [types.ts:975](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L975)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:977](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L977)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:979](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L979)

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
