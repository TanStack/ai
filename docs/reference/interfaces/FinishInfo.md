---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:592](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L592)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:598](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L598)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:596](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L596)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:594](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L594)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:600](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L600)

Final usage totals, if available (optionally including provider-reported cost)
