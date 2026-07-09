---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L240)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:246](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L246)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:244](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L244)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:242](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L242)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:250](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L250)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:248](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L248)

Name of the tool
