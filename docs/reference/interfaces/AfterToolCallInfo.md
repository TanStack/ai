---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L227)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L239)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:242](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L242)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L237)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L241)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L231)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L229)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L235)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L233)

Name of the tool
