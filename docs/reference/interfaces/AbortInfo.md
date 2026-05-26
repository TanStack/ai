---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:299](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L299)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:303](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L303)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:301](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L301)

The reason for the abort, if provided
