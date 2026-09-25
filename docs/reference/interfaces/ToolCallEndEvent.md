---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

Defined in: [packages/ai/src/types.ts:1354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1354)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`, `subagentRunId?`

## Extends

- `Omit`\<`AGUIToolCallEndEvent`, `"type"`\>

## Properties

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:1357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1357)

Parsed tool arguments when the adapter already parsed them.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1358)

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

Defined in: [packages/ai/src/types.ts:1355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1355)
