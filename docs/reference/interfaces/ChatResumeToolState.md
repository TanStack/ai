---
id: ChatResumeToolState
title: ChatResumeToolState
---

# Interface: ChatResumeToolState

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:331](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L331)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:332](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L332)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L345)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:333](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L333)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:344](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L344)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:338](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L338)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:334](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L334)
