---
id: DoneStreamChunk
title: DoneStreamChunk
---

# ~~Interface: DoneStreamChunk~~

Defined in: [types.ts:849](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L849)

## Deprecated

Use RunFinishedEvent instead

## Properties

### ~~finishReason?~~

```ts
optional finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:854](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L854)

***

### ~~id~~

```ts
id: string;
```

Defined in: [types.ts:851](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L851)

***

### ~~model~~

```ts
model: string;
```

Defined in: [types.ts:852](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L852)

***

### ~~timestamp~~

```ts
timestamp: number;
```

Defined in: [types.ts:853](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L853)

***

### ~~type~~

```ts
type: "done";
```

Defined in: [types.ts:850](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L850)

***

### ~~usage?~~

```ts
optional usage: object;
```

Defined in: [types.ts:855](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L855)

#### ~~completionTokens~~

```ts
completionTokens: number;
```

#### ~~promptTokens~~

```ts
promptTokens: number;
```

#### ~~totalTokens~~

```ts
totalTokens: number;
```
