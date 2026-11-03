---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:396](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L396)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L397)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:411](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L411)

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:399](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L399)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L398)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:410](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L410)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:404](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L404)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L400)
