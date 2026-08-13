---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/ai/src/types.ts:1180](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1180)

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

Defined in: [packages/ai/src/types.ts:1189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1189)

Index for parallel tool calls

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1194](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1194)

Provider-specific metadata to carry into the ToolCall.
Untyped at the event layer because events flow through a discriminated
union that does not survive generics; adapters cast it to their typed
`TToolCallMetadata` shape when emitting.

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1182)

Model identifier for multi-model support

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/ai/src/types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1187)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
