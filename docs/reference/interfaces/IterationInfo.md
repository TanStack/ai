---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L446)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L448)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:450](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L450)

The assistant message ID created for this iteration
