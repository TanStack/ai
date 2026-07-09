---
id: GenerationErrorInfo
title: GenerationErrorInfo
---

# Interface: GenerationErrorInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:161](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L161)

Information passed to [GenerationMiddleware.onError](GenerationMiddleware.md#onerror).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L165)

Wall-clock duration until the failure, in milliseconds.

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L163)

The thrown value (typically an `Error`).
