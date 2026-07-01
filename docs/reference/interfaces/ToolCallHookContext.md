---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L227)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L233)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L231)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L229)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L237)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L235)

Name of the tool
