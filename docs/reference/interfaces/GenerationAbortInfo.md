---
id: GenerationAbortInfo
title: GenerationAbortInfo
---

# Interface: GenerationAbortInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L153)

Information passed to [GenerationMiddleware.onAbort](GenerationMiddleware.md#onabort).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:157](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L157)

Wall-clock duration until the abort, in milliseconds.

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L155)

The reason for the abort, if provided.
