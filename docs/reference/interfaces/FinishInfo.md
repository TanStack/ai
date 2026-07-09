---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L370)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:376](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L376)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L374)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L372)

The finish reason from the last model response

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L378)

Final usage totals, if available (optionally including provider-reported cost)
