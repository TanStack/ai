---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L240)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:246](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L246)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:244](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L244)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:242](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L242)

The finish reason from the last model response

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:248](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L248)

Final usage totals, if available

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
