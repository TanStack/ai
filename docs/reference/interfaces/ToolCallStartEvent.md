---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/typescript/ai/src/types.ts:897](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L897)

Emitted when a tool call starts.

@ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`
TanStack AI adds: `model?`, `toolName` (deprecated alias), `index?`, `providerMetadata?`

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

Defined in: [packages/typescript/ai/src/types.ts:906](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L906)

Index for parallel tool calls

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:899](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L899)

Model identifier for multi-model support

***

### providerMetadata?

```ts
optional providerMetadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:908](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L908)

Provider-specific metadata to carry into the ToolCall

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:904](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L904)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
