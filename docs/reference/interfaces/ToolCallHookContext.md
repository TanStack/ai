---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:162](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L162)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L168)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:166](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L166)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L164)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:172](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L172)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:170](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L170)

Name of the tool
