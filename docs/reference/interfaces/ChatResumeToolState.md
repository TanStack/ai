---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L337)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:338](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L338)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L351)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L339)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:350](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L350)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:344](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L344)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:340](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L340)
