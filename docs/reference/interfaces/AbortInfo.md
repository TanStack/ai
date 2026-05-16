---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:269](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L269)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L273)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:271](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L271)

The reason for the abort, if provided
