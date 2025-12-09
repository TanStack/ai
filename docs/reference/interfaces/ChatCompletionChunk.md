---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:612](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L612)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:615](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L615)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:617](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L617)

***

### id

```ts
id: string;
```

Defined in: [types.ts:613](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L613)

***

### model

```ts
model: string;
```

Defined in: [types.ts:614](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L614)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:616](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L616)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L618)

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
