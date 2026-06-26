---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L337)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L341)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L339)

The error that caused the failure
