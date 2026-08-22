---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1416)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
erase discriminant property access on [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) /
[TypedStreamChunk](../type-aliases/TypedStreamChunk.md) unions.

## Extends

- `Pick`\<`AGUICustomEvent`, `"name"` \| `"value"` \| `"timestamp"` \| `"rawEvent"`\>

## Extended by

- [`StructuredOutputCompleteEvent`](StructuredOutputCompleteEvent.md)
- [`StructuredOutputStartEvent`](StructuredOutputStartEvent.md)
- [`ApprovalRequestedEvent`](ApprovalRequestedEvent.md)
- [`ToolInputAvailableEvent`](ToolInputAvailableEvent.md)
- [`UIResourceEvent`](UIResourceEvent.md)
- [`SandboxFileCustomEvent`](SandboxFileCustomEvent.md)
- [`SandboxFileDiffEvent`](SandboxFileDiffEvent.md)
- [`FileChangedEvent`](FileChangedEvent.md)
- [`SessionIdEvent`](SessionIdEvent.md)
- [`CodeModeExecutionStartedEvent`](CodeModeExecutionStartedEvent.md)
- [`CodeModeConsoleEvent`](CodeModeConsoleEvent.md)
- [`CodeModeExternalCallEvent`](CodeModeExternalCallEvent.md)
- [`CodeModeExternalResultEvent`](CodeModeExternalResultEvent.md)
- [`CodeModeExternalErrorEvent`](CodeModeExternalErrorEvent.md)
- [`CodeModeSnippetCallEvent`](CodeModeSnippetCallEvent.md)
- [`CodeModeSnippetResultEvent`](CodeModeSnippetResultEvent.md)
- [`CodeModeSnippetErrorEvent`](CodeModeSnippetErrorEvent.md)
- [`SnippetRegisteredEvent`](SnippetRegisteredEvent.md)

## Properties

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1422)

Model identifier for multi-model support

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1430)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1429)

Routing metadata the TanStack engine attaches when emitting CUSTOM
events that need to be correlated with a specific thread/run.
Stripped by `strip-to-spec-middleware` before going on the wire so
the AG-UI consumer never sees them (when that middleware is enabled).

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1420)
