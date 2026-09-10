---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1297)

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

Defined in: [packages/ai/src/types.ts:1303](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1303)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1304](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1304)

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [packages/ai/src/types.ts:1301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1301)
