---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L439)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L441)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:443](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L443)

The assistant message ID created for this iteration
