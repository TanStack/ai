---
id: ChatResumeToolState
title: ChatResumeToolState
---

# Interface: ChatResumeToolState

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:223](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L223)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals: ReadonlyMap<string, boolean>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:224](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L224)

***

### clientToolResults?

```ts
optional clientToolResults: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:225](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L225)
