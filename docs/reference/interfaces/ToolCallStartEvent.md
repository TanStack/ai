---
id: ToolCallStartEvent
title: ToolCallStartEvent
---

Defined in: [packages/ai/src/types.ts:1331](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1331)

Emitted when a tool call starts.

@ag-ui/core provides: `toolCallId`, `toolCallName`, `parentMessageId?`,
`subagentRunId?`

## Extends

- `Omit`\<`AGUIToolCallStartEvent`, `"type"`\>

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1339)

Provider-specific metadata to carry into the ToolCall.

#### Overrides

```ts
Omit.metadata
```

***

### toolName?

```ts
optional toolName?: string;
```

Defined in: [packages/ai/src/types.ts:1337](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1337)

Alias of `toolCallName`. Kept so existing stream readers still compile.

***

### type

```ts
type: "TOOL_CALL_START";
```

Defined in: [packages/ai/src/types.ts:1335](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1335)
