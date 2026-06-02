---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:196](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L196)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L208)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L211)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:206](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L206)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:210](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L210)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string, unknown>
  | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L200)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L198)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:204](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L204)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:202](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L202)

Name of the tool
