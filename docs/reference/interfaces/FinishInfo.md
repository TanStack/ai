---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L357)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L363)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L361)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L359)

The finish reason from the last model response

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L365)

Final usage totals, if available (optionally including provider-reported cost)
