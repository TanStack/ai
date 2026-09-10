---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:494](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L494)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:500](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L500)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:498](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L498)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:496](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L496)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:502](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L502)

Final usage totals, if available (optionally including provider-reported cost)
