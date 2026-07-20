---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L296)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L298)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L300)

The assistant message ID created for this iteration
