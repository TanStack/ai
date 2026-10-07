---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:403](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L403)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:409](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L409)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:407](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L407)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:405](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L405)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:413](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L413)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:411](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L411)

Name of the tool
