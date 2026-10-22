---
id: GenerationErrorInfo
title: GenerationErrorInfo
---

Defined in: packages/ai/src/activities/middleware/types.ts:155

Information passed to [GenerationMiddleware.onError](GenerationMiddleware.md#onerror).

## Properties

### duration

```ts
duration: number;
```

Defined in: packages/ai/src/activities/middleware/types.ts:159

Wall-clock duration until the failure, in milliseconds.

***

### error

```ts
error: unknown;
```

Defined in: packages/ai/src/activities/middleware/types.ts:157

The thrown value (typically an `Error`).
