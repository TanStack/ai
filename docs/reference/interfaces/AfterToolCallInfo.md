---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:258](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L258)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L270)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L273)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L268)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:272](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L272)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:262](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L262)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:260](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L260)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L266)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L264)

Name of the tool
