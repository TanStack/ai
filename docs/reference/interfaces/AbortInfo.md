---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:301](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L301)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:305](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L305)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:303](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L303)

The reason for the abort, if provided
