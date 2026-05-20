---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L300)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:304](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L304)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L302)

The reason for the abort, if provided
