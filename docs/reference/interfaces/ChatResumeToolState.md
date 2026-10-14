---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:379](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L379)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L380)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L394)

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:382](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L382)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:381](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L381)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L393)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:387](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L387)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L383)
