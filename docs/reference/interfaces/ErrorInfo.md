---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:381](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L381)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:385](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L385)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L383)

The error that caused the failure
