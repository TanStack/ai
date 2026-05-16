---
id: IterationInfo
title: IterationInfo
---

# Interface: IterationInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L190)

Information passed to onIteration at the start of each agent loop iteration.

## Properties

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L192)

0-based iteration index

***

### messageId

```ts
messageId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L194)

The assistant message ID created for this iteration
