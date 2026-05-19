---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1348)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1351)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1353](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1353)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1349)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1350)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1352](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1352)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1354](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1354)

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
