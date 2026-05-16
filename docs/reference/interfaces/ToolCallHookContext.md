---
id: ToolCallHookContext
title: ToolCallHookContext
---

# Interface: ToolCallHookContext

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L134)

Context provided to tool call hooks (onBeforeToolCall / onAfterToolCall).

## Properties

### args

```ts
args: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:140](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L140)

Parsed arguments for the tool call

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L138)

The resolved tool definition, if found

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L136)

The tool call being executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L144)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L142)

Name of the tool
