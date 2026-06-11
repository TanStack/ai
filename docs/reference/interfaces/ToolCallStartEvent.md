---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/ai/src/types.ts:1056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1056)

Emitted when a tool call starts.

@ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`
TanStack AI adds: `model?`, `toolName` (deprecated alias), `index?`, `metadata?`

## Extends

- `ToolCallStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### index?

```ts
optional index: number;
```

Defined in: [packages/ai/src/types.ts:1065](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1065)

Index for parallel tool calls

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1070](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1070)

Provider-specific metadata to carry into the ToolCall.
Untyped at the event layer because events flow through a discriminated
union that does not survive generics; adapters cast it to their typed
`TToolCallMetadata` shape when emitting.

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1058](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1058)

Model identifier for multi-model support

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/ai/src/types.ts:1063](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1063)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
