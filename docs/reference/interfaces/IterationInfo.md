---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:478](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L478)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L480)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:482](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L482)

The assistant message ID created for this iteration
