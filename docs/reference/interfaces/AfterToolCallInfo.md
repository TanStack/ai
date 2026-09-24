---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:421](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L421)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L433)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L436)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L431)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L435)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:425](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L425)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:423](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L423)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L429)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L427)

Name of the tool
