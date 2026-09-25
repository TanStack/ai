---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:390](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L390)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:396](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L396)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L394)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:392](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L392)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L400)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L398)

Name of the tool
