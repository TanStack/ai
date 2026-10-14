---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:556](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L556)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:562](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L562)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:560](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L560)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:558](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L558)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:564](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L564)

Final usage totals, if available (optionally including provider-reported cost)
