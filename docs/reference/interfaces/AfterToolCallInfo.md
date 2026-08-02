---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:271](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L271)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:283](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L283)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:286](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L286)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:281](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L281)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L285)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:275](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L275)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L273)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:279](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L279)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:277](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L277)

Name of the tool
