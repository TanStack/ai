---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1061](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1061)

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

Defined in: [packages/ai/src/types.ts:1065](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1065)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1063](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1063)

Model identifier for multi-model support
