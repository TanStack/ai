---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L274)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L280)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:278](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L278)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L276)

The finish reason from the last model response

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L282)

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
