---
id: ToolCallArgsEvent
title: ToolCallArgsEvent
---

# Interface: ToolCallArgsEvent

Defined in: [packages/typescript/ai/src/types.ts:914](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L914)

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

Defined in: [packages/typescript/ai/src/types.ts:918](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L918)

Full accumulated arguments so far (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:916](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L916)

Model identifier for multi-model support
