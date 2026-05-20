---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:191](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L191)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L193)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L195)

The assistant message ID created for this iteration
