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
  | StepStartedEvent
  | StepFinishedEvent
  | MessagesSnapshotEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent;
```

Defined in: [types.ts:948](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L948)

Union of all AG-UI events.
