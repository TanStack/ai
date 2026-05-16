---
id: AfterToolCallInfo
title: AfterToolCallInfo
---

# Interface: AfterToolCallInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L165)

Outcome information provided to onAfterToolCall.

## Properties

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:177](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L177)

Duration of tool execution in milliseconds

***

### error?

```ts
optional error: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L180)

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L175)

Whether the execution succeeded

***

### result?

```ts
optional result: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:179](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L179)

The result (if ok) or error (if not ok)

***

### tool

```ts
tool: 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L169)

The resolved tool definition

***

### toolCall

```ts
toolCall: ToolCall;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L167)

The tool call that was executed

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L173)

ID of the tool call

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L171)

Name of the tool
