---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:193](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L193)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:205](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L205)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L208)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:203](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L203)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L207)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:197](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L197)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:195](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L195)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:201](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L201)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:199](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L199)

Name of the tool
