---
id: KnownCustomEvent
title: KnownCustomEvent
---

```ts
type KnownCustomEvent = 
  | SandboxFileCustomEvent
  | SandboxFileDiffEvent
  | SandboxStartingEvent
  | SandboxCreatedEvent
  | SandboxResumedEvent
  | FileChangedEvent
  | SessionIdEvent
  | CodeModeExecutionStartedEvent
  | CodeModeConsoleEvent
  | CodeModeExternalCallEvent
  | CodeModeExternalResultEvent
  | CodeModeExternalErrorEvent
  | CodeModeSnippetCallEvent
  | CodeModeSnippetResultEvent
  | CodeModeSnippetErrorEvent
  | SnippetRegisteredEvent
  | StructuredOutputStartEvent
  | StructuredOutputCompleteEvent
  | UIResourceEvent;
```

Defined in: [packages/ai/src/types.ts:1974](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1974)

Every CUSTOM event TanStack AI itself emits, as a discriminated union on
`name`. User-emitted custom events (via `emitCustomEvent` with a custom name)
are intentionally absent — they still flow at runtime.
