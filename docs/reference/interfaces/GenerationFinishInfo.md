---
id: GenerationFinishInfo
title: GenerationFinishInfo
---

Defined in: [packages/ai/src/activities/middleware/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L137)

Information passed to [GenerationMiddleware.onFinish](GenerationMiddleware.md#onfinish).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L139)

Wall-clock duration of the activity call, in milliseconds.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L141)

Unified usage, when the provider reported it.
