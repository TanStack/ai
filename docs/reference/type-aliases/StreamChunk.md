---
id: StreamChunk
title: StreamChunk
---

# Type Alias: StreamChunk

```ts
type StreamChunk = 
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
  | CustomEvent
  | ContentStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | ThinkingStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk;
```

Defined in: [types.ts:794](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L794)

Union type for all AG-UI events.
This is the primary type for streaming chat completions.
Includes legacy types for backward compatibility.
