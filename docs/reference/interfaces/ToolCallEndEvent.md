---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

Defined in: [packages/ai/src/types.ts:1727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1727)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`, `subagentRunId?`

## Extends

- `Omit`\<`AGUIToolCallEndEvent`, `"type"`\>

## Properties

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:1730](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1730)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1731)

Extra information attached to this event.

#### Overrides

```ts
Omit.metadata
```

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [packages/ai/src/types.ts:1728](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1728)
