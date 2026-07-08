---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L358)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:362](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L362)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L360)

The reason for the abort, if provided
