---
id: GenerationAbortInfo
title: GenerationAbortInfo
---

# Interface: GenerationAbortInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L97)

Information passed to [GenerationMiddleware.onAbort](GenerationMiddleware.md#onabort).

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L101)

Wall-clock duration until the abort, in milliseconds.

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L99)

The reason for the abort, if provided.
