---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:272](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L272)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L276)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L274)

The reason for the abort, if provided
