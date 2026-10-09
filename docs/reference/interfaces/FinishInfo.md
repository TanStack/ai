---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:539](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L539)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:545](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L545)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:543](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L543)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:541](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L541)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:547](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L547)

Final usage totals, if available (optionally including provider-reported cost)
