---
id: ToolCallHookContext
title: ToolCallHookContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L383)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L389)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:387](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L387)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:385](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L385)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L393)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L391)

Name of the tool
