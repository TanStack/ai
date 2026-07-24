---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1203](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1203)

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
optional args: string;
```

Defined in: [packages/ai/src/types.ts:1207](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1207)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1205](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1205)

Model identifier for multi-model support
