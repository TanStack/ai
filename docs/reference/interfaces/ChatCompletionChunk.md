---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:431](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L431)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:434](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L434)

***

### finishReason?

```ts
optional finishReason: "stop" | "length" | "content_filter" | null;
```

Defined in: [types.ts:436](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L436)

***

### id

```ts
id: string;
```

Defined in: [types.ts:432](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L432)

***

### model

```ts
model: string;
```

Defined in: [types.ts:433](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L433)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:435](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L435)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:437](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L437)

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
