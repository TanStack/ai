---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L322)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L324)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L326)

The assistant message ID created for this iteration
