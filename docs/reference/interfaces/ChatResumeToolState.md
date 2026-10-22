---
id: ChatResumeToolState
title: ChatResumeToolState
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L389)

Tool decisions reconstructed by server-side middleware from validated resume
entries. This lets empty-message interrupt resumes continue tool execution
without relying on client message history.

## Properties

### approvals?

```ts
optional approvals?: ReadonlyMap<string, ToolApprovalResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:390](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L390)

***

### cancelledToolCallIds?

```ts
optional cancelledToolCallIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:404](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L404)

***

### clientToolErrors?

```ts
optional clientToolErrors?: ReadonlyMap<string, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:392](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L392)

***

### clientToolResults?

```ts
optional clientToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L391)

***

### deniedToolResults?

```ts
optional deniedToolResults?: ReadonlyMap<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:403](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L403)

***

### genericInterruptRequests?

```ts
optional genericInterruptRequests?: ReadonlyMap<string, GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L397)

Durable generic requests reconstructed by server middleware.

***

### genericInterrupts?

```ts
optional genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L393)
