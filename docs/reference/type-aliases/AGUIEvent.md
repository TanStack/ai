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
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent;
```

Defined in: [types.ts:872](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L872)

Union of all AG-UI events.
