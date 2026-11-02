---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:494](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L494)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:506](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L506)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:509](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L509)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:504](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L504)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:508](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L508)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:498](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L498)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:496](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L496)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:502](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L502)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:500](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L500)

Name of the tool
