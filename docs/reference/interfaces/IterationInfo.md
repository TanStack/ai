---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L433)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L435)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L437)

The assistant message ID created for this iteration
