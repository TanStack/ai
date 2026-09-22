---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:414](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L414)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:426](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L426)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L429)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:424](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L424)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L428)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L418)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:416](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L416)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:422](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L422)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:420](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L420)

Name of the tool
