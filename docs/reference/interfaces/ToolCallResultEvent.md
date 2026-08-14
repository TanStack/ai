---
id: ToolCallResultEvent
title: ToolCallResultEvent
---

# Interface: ToolCallResultEvent

Defined in: [packages/ai/src/types.ts:1300](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1300)

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
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1302](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1302)

Model identifier for multi-model support

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1304](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1304)

Tool execution output state (TanStack AI internal)
