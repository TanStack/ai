---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:303](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L303)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:307](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L307)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:305](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L305)

The error that caused the failure
