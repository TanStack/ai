---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L441)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:453](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L453)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:456](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L456)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:451](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L451)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:455](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L455)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:445](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L445)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:443](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L443)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:449](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L449)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L447)

Name of the tool
