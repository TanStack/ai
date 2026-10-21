---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:383

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:384

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:398

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:386

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:385

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:397

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:391

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:387
