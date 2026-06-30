---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1120)

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

Defined in: [packages/ai/src/types.ts:1124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1124)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1122](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1122)

Model identifier for multi-model support
