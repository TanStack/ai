---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:956](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L956)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:959](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L959)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:961](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L961)

***

### id

```ts
id: string;
```

Defined in: [types.ts:957](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L957)

***

### model

```ts
model: string;
```

Defined in: [types.ts:958](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L958)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:960](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L960)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:962](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L962)

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
