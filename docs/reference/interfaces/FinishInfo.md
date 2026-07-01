---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:344](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L344)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:350](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L350)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:346](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L346)

The finish reason from the last model response

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:352](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L352)

Final usage totals, if available (optionally including provider-reported cost)
