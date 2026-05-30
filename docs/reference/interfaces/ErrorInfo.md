---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:306](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L306)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:310](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L310)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:308](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L308)

The error that caused the failure
