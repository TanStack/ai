---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:874](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L874)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:877](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L877)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:879](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L879)

***

### id

```ts
id: string;
```

Defined in: [types.ts:875](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L875)

***

### model

```ts
model: string;
```

Defined in: [types.ts:876](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L876)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:878](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L878)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:880](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L880)

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
