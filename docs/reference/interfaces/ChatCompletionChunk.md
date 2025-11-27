---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L362)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L365)

***

### finishReason?

```ts
optional finishReason: "stop" | "length" | "content_filter" | null;
```

Defined in: [types.ts:367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L367)

***

### id

```ts
id: string;
```

Defined in: [types.ts:363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L363)

***

### model

```ts
model: string;
```

Defined in: [types.ts:364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L364)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:366](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L366)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L368)

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
