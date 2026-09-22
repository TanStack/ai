---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

Defined in: [packages/ai/src/types.ts:1319](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1319)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`

Same `Pick` (not `extends`) rationale as [ToolCallStartEvent](ToolCallStartEvent.md).

## Extends

- `Pick`\<`AGUIToolCallEndEvent`, `"toolCallId"` \| `"timestamp"` \| `"rawEvent"`\>

## Properties

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:1325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1325)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1326](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1326)

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [packages/ai/src/types.ts:1323](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1323)
