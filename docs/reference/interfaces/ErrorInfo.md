---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:311](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L311)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L315)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L313)

The error that caused the failure
