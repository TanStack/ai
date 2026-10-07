---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:356](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L356)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L357)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L371)

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L359)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L358)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L370)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L364)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L360)
