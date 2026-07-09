---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:284](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L284)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L296)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:299](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L299)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:294](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L294)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L298)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L288)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:286](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L286)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:292](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L292)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L290)

Name of the tool
