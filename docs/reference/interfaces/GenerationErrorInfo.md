---
id: GenerationErrorInfo
title: GenerationErrorInfo
---

# Interface: GenerationErrorInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L105)

Information passed to [GenerationMiddleware.onError](GenerationMiddleware.md#onerror).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L109)

Wall-clock duration until the failure, in milliseconds.

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L107)

The thrown value (typically an `Error`).
