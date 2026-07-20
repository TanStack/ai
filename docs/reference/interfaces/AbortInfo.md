---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L371)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:375](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L375)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L373)

The reason for the abort, if provided
