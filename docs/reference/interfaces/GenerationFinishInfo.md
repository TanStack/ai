---
id: GenerationFinishInfo
title: GenerationFinishInfo
---

# Interface: GenerationFinishInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L89)

Information passed to [GenerationMiddleware.onFinish](GenerationMiddleware.md#onfinish).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L91)

Wall-clock duration of the activity call, in milliseconds.

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L93)

Unified usage, when the provider reported it.
