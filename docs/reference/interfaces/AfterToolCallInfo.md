---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:471](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L471)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:483](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L483)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:486](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L486)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:481](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L481)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:485](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L485)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:475](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L475)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:473](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L473)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:479](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L479)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:477](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L477)

Name of the tool
