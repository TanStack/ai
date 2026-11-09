---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

Defined in: [packages/ai/src/types.ts:1767](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1767)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`, `subagentRunId?`

## Extends

- `Omit`\<`AGUIToolCallEndEvent`, `"type"`\>

## Properties

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:1770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1770)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1771](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1771)

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

Defined in: [packages/ai/src/types.ts:1768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1768)
