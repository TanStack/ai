---
id: AbortInfo
title: AbortInfo
---

# Interface: AbortInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:292](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L292)

Information passed to onAbort.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L296)

Duration until abort in milliseconds

***

### reason?

```ts
optional reason: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:294](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L294)

The reason for the abort, if provided
