---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:731](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L731)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:734](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L734)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:736](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L736)

***

### id

```ts
id: string;
```

Defined in: [types.ts:732](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L732)

***

### model

```ts
model: string;
```

Defined in: [types.ts:733](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L733)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:735](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L735)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:737](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L737)

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
