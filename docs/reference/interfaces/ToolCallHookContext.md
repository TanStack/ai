---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:445](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L445)

Context provided to tool call hooks (onBeforeToolCall / onGuardToolCall /
onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:455](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L455)

Parsed arguments for the tool call, before the `inputSchema` check: no
schema defaults or transforms yet, and possibly invalid. In
`onGuardToolCall`, these are the final checked arguments.

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:449](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L449)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L447)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:459](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L459)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:457](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L457)

Name of the tool
