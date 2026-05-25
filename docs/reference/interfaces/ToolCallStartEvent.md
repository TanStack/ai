---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/typescript/ai/src/types.ts:993](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L993)

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

Defined in: [packages/typescript/ai/src/types.ts:1002](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1002)

Index for parallel tool calls

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:1007](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1007)

Provider-specific metadata to carry into the ToolCall.
Untyped at the event layer because events flow through a discriminated
union that does not survive generics; adapters cast it to their typed
`TToolCallMetadata` shape when emitting.

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:995](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L995)

Model identifier for multi-model support

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1000](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1000)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
