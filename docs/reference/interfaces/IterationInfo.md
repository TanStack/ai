---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:283](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L283)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L285)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L287)

The assistant message ID created for this iteration
