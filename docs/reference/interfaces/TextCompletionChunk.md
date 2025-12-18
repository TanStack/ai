---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:747](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L747)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

***

### id

```ts
id: string;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

***

### model

```ts
model: string;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L751)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

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
