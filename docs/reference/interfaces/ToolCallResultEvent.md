---
id: ToolCallResultEvent
title: ToolCallResultEvent
---

# Interface: ToolCallResultEvent

Defined in: [packages/typescript/ai/src/types.ts:991](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L991)

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

Defined in: [packages/typescript/ai/src/types.ts:993](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L993)

Model identifier for multi-model support
