---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:507](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L507)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:513](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L513)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:511](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L511)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:509](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L509)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:515](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L515)

Final usage totals, if available (optionally including provider-reported cost)
