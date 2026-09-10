---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:408](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L408)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:420](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L420)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:423](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L423)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L418)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:422](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L422)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:412](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L412)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:410](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L410)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:416](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L416)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:414](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L414)

Name of the tool
