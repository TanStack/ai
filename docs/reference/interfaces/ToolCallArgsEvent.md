---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:956](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L956)

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

Defined in: [packages/typescript/ai/src/types.ts:960](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L960)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:958](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L958)

Model identifier for multi-model support
