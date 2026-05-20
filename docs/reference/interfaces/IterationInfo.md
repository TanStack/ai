---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L213)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L215)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L217)

The assistant message ID created for this iteration
