---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:459](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L459)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:461](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L461)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:463](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L463)

The assistant message ID created for this iteration
