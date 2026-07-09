---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L384)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:388](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L388)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:386](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L386)

The reason for the abort, if provided
