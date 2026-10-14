---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L427)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L433)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L431)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L429)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L437)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L435)

Name of the tool
