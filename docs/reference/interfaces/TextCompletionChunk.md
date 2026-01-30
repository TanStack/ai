---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:896](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L896)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:899](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L899)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:901](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L901)

***

### id

```ts
id: string;
```

Defined in: [types.ts:897](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L897)

***

### model

```ts
model: string;
```

Defined in: [types.ts:898](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L898)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:900](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L900)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:902](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L902)

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
