---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/ai/src/types.ts:1117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1117)

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

Defined in: [packages/ai/src/types.ts:1126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1126)

Index for parallel tool calls

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1131)

Provider-specific metadata to carry into the ToolCall.
Untyped at the event layer because events flow through a discriminated
union that does not survive generics; adapters cast it to their typed
`TToolCallMetadata` shape when emitting.

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1119)

Model identifier for multi-model support

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/ai/src/types.ts:1124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1124)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
