---
id: GenerationFinishInfo
title: GenerationFinishInfo
---

# Interface: GenerationFinishInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L135)

Information passed to [GenerationMiddleware.onFinish](GenerationMiddleware.md#onfinish).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L137)

Wall-clock duration of the activity call, in milliseconds.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L139)

Unified usage, when the provider reported it.
