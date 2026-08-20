---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:297](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L297)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:309](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L309)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L312)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:307](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L307)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:311](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L311)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:301](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L301)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:299](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L299)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:305](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L305)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:303](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L303)

Name of the tool
