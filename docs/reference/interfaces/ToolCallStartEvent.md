---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/typescript/ai/src/types.ts:894](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L894)

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

Defined in: [packages/typescript/ai/src/types.ts:903](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L903)

Index for parallel tool calls

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:896](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L896)

Model identifier for multi-model support

***

### providerMetadata?

```ts
optional providerMetadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:905](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L905)

Provider-specific metadata to carry into the ToolCall

***

### ~~toolName~~

```ts
toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:901](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L901)

#### Deprecated

Use `toolCallName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
