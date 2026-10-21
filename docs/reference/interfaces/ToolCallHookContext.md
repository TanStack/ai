---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:431

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:440

Parsed arguments for the tool call, before the `inputSchema` check: no
schema defaults or transforms yet, and possibly invalid.

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:435

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:433

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:444

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:442

Name of the tool
