---
id: AGUIEventType
title: AGUIEventType
---

# Type Alias: AGUIEventType

```ts
type AGUIEventType = 
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
  | "CUSTOM";
```

Defined in: [types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

AG-UI Protocol event types.
Based on the AG-UI specification for agent-user interaction.

## See

https://docs.ag-ui.com/concepts/events
