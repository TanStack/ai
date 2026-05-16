---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:251](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L251)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:257](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L257)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:255](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L255)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L253)

The finish reason from the last model response

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L259)

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
