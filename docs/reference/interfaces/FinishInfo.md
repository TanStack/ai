---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L383)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L389)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:387](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L387)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:385](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L385)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L391)

Final usage totals, if available (optionally including provider-reported cost)
