---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:520](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L520)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:526](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L526)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:524](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L524)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:522](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L522)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:528](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L528)

Final usage totals, if available (optionally including provider-reported cost)
