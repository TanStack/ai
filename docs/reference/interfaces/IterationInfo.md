---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:309](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L309)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:311](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L311)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L313)

The assistant message ID created for this iteration
