---
id: GenerationFinishInfo
title: GenerationFinishInfo
---

# Interface: GenerationFinishInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L145)

Information passed to [GenerationMiddleware.onFinish](GenerationMiddleware.md#onfinish).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L147)

Wall-clock duration of the activity call, in milliseconds.

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L149)

Unified usage, when the provider reported it.
