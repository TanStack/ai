---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:1016](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1016)

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

Defined in: [packages/typescript/ai/src/types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1020)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1018](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1018)

Model identifier for multi-model support
