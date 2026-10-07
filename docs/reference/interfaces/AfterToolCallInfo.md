---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:434](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L434)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L446)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:449](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L449)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L444)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L448)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L438)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L436)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:442](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L442)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L440)

Name of the tool
