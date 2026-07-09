---
id: GenerationRunIdentity
title: GenerationRunIdentity
---

# Interface: GenerationRunIdentity

Defined in: [packages/ai/src/activities/middleware/types.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L43)

Caller/server supplied identity for a generation run.

## Properties

### runId?

```ts
optional runId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L47)

Stable run id for correlating generation events.

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L45)

Stable conversation/thread id for correlating generation events.
