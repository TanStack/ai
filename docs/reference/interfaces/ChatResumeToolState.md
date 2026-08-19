---
id: ChatResumeToolState
title: ChatResumeToolState
---

# Interface: ChatResumeToolState

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L227)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L228)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:234](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L234)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L229)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L233)

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L230)
