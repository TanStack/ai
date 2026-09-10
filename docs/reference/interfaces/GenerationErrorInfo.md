---
id: GenerationErrorInfo
title: GenerationErrorInfo
---

# Interface: GenerationErrorInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L151)

Information passed to [GenerationMiddleware.onError](GenerationMiddleware.md#onerror).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L155)

Wall-clock duration until the failure, in milliseconds.

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L153)

The thrown value (typically an `Error`).
