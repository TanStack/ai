---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1358)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1361](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1361)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1363)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1359)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1360](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1360)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1362)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1364)

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
