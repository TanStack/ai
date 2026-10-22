---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:464

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:476

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:479

***

### ok

```ts
ok: boolean;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:474

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:478

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:468

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:466

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:472

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:470

Name of the tool
