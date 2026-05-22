---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:279](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L279)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L285)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L283)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:281](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L281)

The finish reason from the last model response

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L287)

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
