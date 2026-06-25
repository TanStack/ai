---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L252)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L254)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:256](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L256)

The assistant message ID created for this iteration
