---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L163)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L169)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L167)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L165)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L173)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L171)

Name of the tool
