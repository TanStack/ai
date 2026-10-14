---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:495](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L495)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:497](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L497)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:499](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L499)

The assistant message ID created for this iteration
