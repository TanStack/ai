---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L437)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L446)

Parsed arguments for the tool call, before the `inputSchema` check: no
schema defaults or transforms yet, and possibly invalid.

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L441)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L439)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:450](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L450)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L448)

Name of the tool
