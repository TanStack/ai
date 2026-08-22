---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

# Interface: ToolCallStartEvent

Defined in: [packages/ai/src/types.ts:1254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1254)

Emitted when a tool call starts.

@ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`

Field shapes are taken from AG-UI via `Pick` (not `extends`) so Zod
`.passthrough()` index signatures do not pollute the StreamChunk
discriminated union — required for [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) narrowing.

## Extends

- `Pick`\<`AGUIToolCallStartEvent`, 
  \| `"toolCallId"`
  \| `"toolCallName"`
  \| `"parentMessageId"`
  \| `"timestamp"`
  \| `"rawEvent"`\>

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1262](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1262)

Provider-specific metadata to carry into the ToolCall.

***

### toolName?

```ts
optional toolName?: string;
```

Defined in: [packages/ai/src/types.ts:1260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1260)

Alias of `toolCallName`. Kept so existing stream readers still compile.

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [packages/ai/src/types.ts:1258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1258)
