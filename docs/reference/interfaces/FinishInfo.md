---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:485](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L485)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:491](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L491)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:489](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L489)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:487](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L487)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:493](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L493)

Final usage totals, if available (optionally including provider-reported cost)
