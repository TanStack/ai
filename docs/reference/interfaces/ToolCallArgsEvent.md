---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1252)

Emitted when tool call arguments are streaming.

@ag-ui/core provides: `toolCallId`, `delta`
TanStack AI adds: `model?`, `args?` (accumulated)

## Extends

- `ToolCallArgsEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### args?

```ts
optional args?: string;
```

Defined in: [packages/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1256)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1254)

Model identifier for multi-model support
