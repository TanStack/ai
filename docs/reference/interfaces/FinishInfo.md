---
id: FinishInfo
title: FinishInfo
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:563

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:569

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:567

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:565

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:571

Final usage totals, if available (optionally including provider-reported cost)
