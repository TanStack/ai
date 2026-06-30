---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:196](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L196)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:202](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L202)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L200)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L198)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:206](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L206)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:204](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L204)

Name of the tool
