---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/ai/src/types.ts:1363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1363)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`

Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
erase discriminant property access on [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) unions.

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

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1368)

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1367)
