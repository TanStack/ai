---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1169)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1172](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1172)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1174)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1170](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1170)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1171)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1173)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1175)

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
