---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:531](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L531)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:533](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L533)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:535](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L535)

The assistant message ID created for this iteration
