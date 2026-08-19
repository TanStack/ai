---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L266)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:272](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L272)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L270)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L268)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L276)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:274](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L274)

Name of the tool
