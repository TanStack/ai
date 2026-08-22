---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L368)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L374)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L372)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L370)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L378)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:376](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L376)

Name of the tool
