---
id: ErrorInfo
title: ErrorInfo
---

# Interface: ErrorInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:525](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L525)

Information passed to onError.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:529](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L529)

Duration until error in milliseconds

***

### error

```ts
error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:527](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L527)

The error that caused the failure
