---
id: ChatResumeToolState
title: ChatResumeToolState
---

# Interface: ChatResumeToolState

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L322)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L323)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:336](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L336)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L324)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L335)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:329](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L329)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L325)
