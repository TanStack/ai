---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:652](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L652)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:655](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L655)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:657](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L657)

***

### id

```ts
id: string;
```

Defined in: [types.ts:653](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L653)

***

### model

```ts
model: string;
```

Defined in: [types.ts:654](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L654)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:656](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L656)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:658](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L658)

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
