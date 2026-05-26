---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1384)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1387](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1387)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1389)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1385)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1386)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1388](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1388)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1390)

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
