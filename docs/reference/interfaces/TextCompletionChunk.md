---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [types.ts:928](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L928)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:931](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L931)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [types.ts:933](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L933)

***

### id

```ts
id: string;
```

Defined in: [types.ts:929](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L929)

***

### model

```ts
model: string;
```

Defined in: [types.ts:930](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L930)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:932](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L932)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:934](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L934)

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
