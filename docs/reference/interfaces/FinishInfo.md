---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:282](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L282)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L288)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:286](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L286)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:284](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L284)

The finish reason from the last model response

***

### usage?

```ts
optional usage: UsageTotals;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L290)

Final usage totals, if available (optionally including provider-reported cost)
