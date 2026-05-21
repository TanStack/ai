---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L219)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L221)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L223)

The assistant message ID created for this iteration
