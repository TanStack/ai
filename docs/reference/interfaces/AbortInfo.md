---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:293](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L293)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:297](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L297)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:295](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L295)

The reason for the abort, if provided
