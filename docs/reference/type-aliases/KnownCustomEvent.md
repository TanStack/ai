---
id: KnownCustomEvent
title: KnownCustomEvent
---

# Type Alias: KnownCustomEvent

```ts
type KnownCustomEvent = 
  | SandboxFileCustomEvent
  | SandboxFileDiffEvent
  | FileChangedEvent
  | SessionIdEvent
  | CodeModeExecutionStartedEvent
  | CodeModeConsoleEvent
  | CodeModeExternalCallEvent
  | CodeModeExternalResultEvent
  | CodeModeExternalErrorEvent
  | CodeModeSkillCallEvent
  | CodeModeSkillResultEvent
  | CodeModeSkillErrorEvent
  | SkillRegisteredEvent
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent
  | ApprovalRequestedEvent
  | ToolInputAvailableEvent
  | UIResourceEvent;
```

Defined in: [packages/ai/src/types.ts:1496](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1496)

Every CUSTOM event TanStack AI itself emits, as a discriminated union on
`name`. User-emitted custom events (via `emitCustomEvent` with a custom name)
are intentionally absent — they still flow at runtime.
