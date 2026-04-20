---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1147)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1150](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1150)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1152](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1152)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1148)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1149)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1151)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1153)

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
