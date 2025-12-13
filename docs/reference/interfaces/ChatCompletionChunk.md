---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:684](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L684)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:687](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L687)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:689](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L689)

***

### id

```ts
id: string;
```

Defined in: [types.ts:685](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L685)

***

### model

```ts
model: string;
```

Defined in: [types.ts:686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L686)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:688](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L688)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

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
