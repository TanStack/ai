---
id: DoneStreamChunk
title: DoneStreamChunk
---

# ~~Interface: DoneStreamChunk~~

Defined in: [types.ts:777](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L777)

## Deprecated

Use RunFinishedEvent instead

## Properties

### ~~finishReason?~~

```ts
optional finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:782](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L782)

***

### ~~id~~

```ts
id: string;
```

Defined in: [types.ts:779](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L779)

***

### ~~model~~

```ts
model: string;
```

Defined in: [types.ts:780](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L780)

***

### ~~timestamp~~

```ts
timestamp: number;
```

Defined in: [types.ts:781](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L781)

***

### ~~type~~

```ts
type: "done";
```

Defined in: [types.ts:778](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L778)

***

### ~~usage?~~

```ts
optional usage: object;
```

Defined in: [types.ts:783](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L783)

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
