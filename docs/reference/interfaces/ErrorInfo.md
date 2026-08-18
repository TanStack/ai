---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:423](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L423)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L427)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:425](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L425)

The error that caused the failure
