---
id: EventType
title: EventType
---

# Type Alias: EventType

```ts
type EventType = 
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "STEP_STARTED"
  | "STEP_FINISHED"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "CUSTOM"
  | "content"
  | "done"
  | "error"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "approval-requested"
  | "tool-input-available";
```

Defined in: [types.ts:595](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L595)

AG-UI Protocol event types.
Based on the AG-UI specification for agent-user interaction.

## See

https://docs.ag-ui.com/concepts/events

Includes legacy type aliases for backward compatibility during migration.
