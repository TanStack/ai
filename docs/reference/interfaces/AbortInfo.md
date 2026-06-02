---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L296)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L300)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L298)

The reason for the abort, if provided
