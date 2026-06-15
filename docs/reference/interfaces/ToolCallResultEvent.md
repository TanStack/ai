---
id: ToolCallResultEvent
title: ToolCallResultEvent
---

# Interface: ToolCallResultEvent

Defined in: [packages/ai/src/types.ts:1116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1116)

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

Defined in: [packages/ai/src/types.ts:1118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1118)

Model identifier for multi-model support

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1120)

Tool execution output state (TanStack AI internal)
