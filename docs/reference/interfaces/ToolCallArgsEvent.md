---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1114](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1114)

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

Defined in: [packages/ai/src/types.ts:1118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1118)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1116)

Model identifier for multi-model support
