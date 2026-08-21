---
id: GenerationAbortInfo
title: GenerationAbortInfo
---

# Interface: GenerationAbortInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L143)

Information passed to [GenerationMiddleware.onAbort](GenerationMiddleware.md#onabort).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L147)

Wall-clock duration until the abort, in milliseconds.

***

### reason?

```ts
optional reason?: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L145)

The reason for the abort, if provided.
