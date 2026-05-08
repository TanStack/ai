---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:917](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L917)

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

Defined in: [packages/typescript/ai/src/types.ts:921](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L921)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:919](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L919)

Model identifier for multi-model support
