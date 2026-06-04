---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L218)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:220](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L220)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:222](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L222)

The assistant message ID created for this iteration
