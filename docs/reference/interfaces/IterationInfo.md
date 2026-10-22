---
id: IterationInfo
title: IterationInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:508](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L508)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:510](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L510)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:512](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L512)

The assistant message ID created for this iteration
