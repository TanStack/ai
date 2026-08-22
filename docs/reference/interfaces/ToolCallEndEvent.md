---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1279)

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

Defined in: [packages/ai/src/types.ts:1285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1285)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1286)

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [packages/ai/src/types.ts:1283](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1283)
