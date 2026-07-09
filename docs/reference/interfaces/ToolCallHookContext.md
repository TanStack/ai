---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L253)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:259](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L259)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:257](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L257)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:255](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L255)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L263)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L261)

Name of the tool
