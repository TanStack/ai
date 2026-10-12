---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L363)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L364)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L378)

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L366)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L365)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L377)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L371)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:367](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L367)
