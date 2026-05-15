---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:925](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L925)

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

Defined in: [packages/typescript/ai/src/types.ts:929](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L929)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:927](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L927)

Model identifier for multi-model support
