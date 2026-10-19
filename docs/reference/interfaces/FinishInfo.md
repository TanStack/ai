---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:569](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L569)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:575](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L575)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:573](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L573)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:571](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L571)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:577](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L577)

Final usage totals, if available (optionally including provider-reported cost)
