---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:458](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L458)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:470](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L470)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:473](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L473)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:468](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L468)

Whether the execution succeeded

***

### result?

```ts
optional result?: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:472](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L472)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:462](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L462)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:460](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L460)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:466](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L466)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:464](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L464)

Name of the tool
