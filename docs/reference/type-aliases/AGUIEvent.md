---
id: AGUIEvent
title: AGUIEvent
---

# Type Alias: AGUIEvent

```ts
type AGUIEvent = 
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StepStartedEvent
  | StepFinishedEvent
  | MessagesSnapshotEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent;
```

Defined in: [packages/typescript/ai/src/types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1237)

Union of all AG-UI events.
