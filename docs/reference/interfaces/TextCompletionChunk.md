---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:755](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L755)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:757](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L757)

***

### id

```ts
id: string;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

***

### model

```ts
model: string;
```

Defined in: [types.ts:754](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L754)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:758](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L758)

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
