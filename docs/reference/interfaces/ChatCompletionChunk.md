---
id: ChatCompletionChunk
title: ChatCompletionChunk
---

# Interface: ChatCompletionChunk

Defined in: [types.ts:946](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L946)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:949](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L949)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:951](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L951)

***

### id

```ts
id: string;
```

Defined in: [types.ts:947](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L947)

***

### model

```ts
model: string;
```

Defined in: [types.ts:948](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L948)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:950](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L950)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:952](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L952)

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
