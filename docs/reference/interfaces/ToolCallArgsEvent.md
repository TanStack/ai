---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1079](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1079)

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

Defined in: [packages/ai/src/types.ts:1083](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1083)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1081](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1081)

Model identifier for multi-model support
