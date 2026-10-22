---
id: FinishInfo
title: FinishInfo
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:562

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:568

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:566

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:564

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:570

Final usage totals, if available (optionally including provider-reported cost)
