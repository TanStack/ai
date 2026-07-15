---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/ai/src/types.ts:1296](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1296)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

## Extends

- `CustomEvent`

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
- [`CodeModeSkillCallEvent`](CodeModeSkillCallEvent.md)
- [`CodeModeSkillResultEvent`](CodeModeSkillResultEvent.md)
- [`CodeModeSkillErrorEvent`](CodeModeSkillErrorEvent.md)
- [`SkillRegisteredEvent`](SkillRegisteredEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1298)

Model identifier for multi-model support
