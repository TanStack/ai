---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/ai/src/types.ts:1080](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1080)

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

Defined in: [packages/ai/src/types.ts:1084](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1084)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1082)

Model identifier for multi-model support
