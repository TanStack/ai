---
id: ToolCallResultEvent
title: ToolCallResultEvent
---

# Interface: ToolCallResultEvent

Defined in: [packages/typescript/ai/src/types.ts:940](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L940)

Emitted when a tool call result is available.

@ag-ui/core provides: `messageId`, `toolCallId`, `content`, `role?`
TanStack AI adds: `model?`

## Extends

- `ToolCallResultEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:942](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L942)

Model identifier for multi-model support
