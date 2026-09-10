---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L377)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L383)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:381](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L381)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:379](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L379)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:387](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L387)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:385](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L385)

Name of the tool
