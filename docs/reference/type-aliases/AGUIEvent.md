---
id: AGUIEvent
title: AGUIEvent
---

```ts
type AGUIEvent = 
  | ActivitySnapshotEvent
  | ActivityDeltaEvent
  | RawEvent
  | TextMessageChunkEvent
  | ToolCallChunkEvent
  | ReasoningMessageChunkEvent
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
  | ReasoningEncryptedValueEvent
  | SubagentStartedEvent
  | SubagentFinishedEvent
  | SubagentErrorEvent;
```

Defined in: [packages/ai/src/types.ts:1839](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1839)

Union of all AG-UI events.
