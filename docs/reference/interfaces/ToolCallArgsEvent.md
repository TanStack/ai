---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:905](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L905)

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

Defined in: [packages/typescript/ai/src/types.ts:909](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L909)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:907](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L907)

Model identifier for multi-model support
