---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:465

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:477

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:480

***

### ok

```ts
ok: boolean;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:475

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:479

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:469

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:467

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:473

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:471

Name of the tool
