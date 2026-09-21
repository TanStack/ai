---
id: FinishInfo
title: FinishInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:500](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L500)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:506](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L506)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:504](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L504)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:502](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L502)

The finish reason from the last model response

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:508](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L508)

Final usage totals, if available (optionally including provider-reported cost)
