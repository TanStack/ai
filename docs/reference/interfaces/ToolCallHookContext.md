---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:410](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L410)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:416](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L416)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:414](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L414)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:412](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L412)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:420](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L420)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L418)

Name of the tool
