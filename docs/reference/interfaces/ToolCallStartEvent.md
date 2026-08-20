---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent\<TToolName\>

Defined in: [packages/ai/src/types.ts:1220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1220)

Emitted when a tool call starts.

@ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`
TanStack AI adds: `model?`, `toolName` (deprecated alias), `index?`, `metadata?`

Field shapes are taken from AG-UI via `Pick` (not `extends`) so Zod
`.passthrough()` index signatures do not pollute the StreamChunk
discriminated union — required for [TypedStreamChunk](../type-aliases/TypedStreamChunk.md) narrowing.

## Extends

- `Pick`\<`AGUIToolCallStartEvent`, 
  \| `"toolCallId"`
  \| `"toolCallName"`
  \| `"parentMessageId"`
  \| `"timestamp"`
  \| `"rawEvent"`\>

## Type Parameters

### TToolName

`TToolName` *extends* `string` = `string`

Constrained tool name type. Defaults to `string` (untyped).
  When the stream is returned from `chat()` with typed tools, `TypedStreamChunk`
  intersects a literal onto `toolCallName` and `toolName` for discrimination.

## Properties

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:1238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1238)

Index for parallel tool calls

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1243)

Provider-specific metadata to carry into the ToolCall.
Untyped at the event layer because events flow through a discriminated
union that does not survive generics; adapters cast it to their typed
`TToolCallMetadata` shape when emitting.

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1228)

Model identifier for multi-model support

***

### ~~toolName~~

```ts
toolName: TToolName;
```

Defined in: [packages/ai/src/types.ts:1236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1236)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

Carries `TToolName` on the base interface; for `toolCallName` narrowing use
[TypedStreamChunk](../type-aliases/TypedStreamChunk.md) (distributed variants intersect the AG-UI field).

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [packages/ai/src/types.ts:1226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1226)
