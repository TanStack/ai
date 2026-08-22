---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:424](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L424)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:426](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L426)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L428)

The assistant message ID created for this iteration
