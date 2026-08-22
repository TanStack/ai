---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:399](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L399)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:411](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L411)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:414](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L414)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:409](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L409)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:413](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L413)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:403](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L403)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:401](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L401)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:407](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L407)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:405](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L405)

Name of the tool
