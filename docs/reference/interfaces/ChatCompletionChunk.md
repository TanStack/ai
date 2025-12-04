---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L605)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:608](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L608)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:610](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L610)

***

### id

```ts
id: string;
```

Defined in: [types.ts:606](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L606)

***

### model

```ts
model: string;
```

Defined in: [types.ts:607](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L607)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L609)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:611](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L611)

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
