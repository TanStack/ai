---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/typescript/ai/src/types.ts:1300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1300)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1303](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1303)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:1305](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1305)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1301)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1302)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/typescript/ai/src/types.ts:1304](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1304)

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1306)

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
