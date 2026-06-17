---
id: ToolCallState
title: ToolCallState
---

# Type Alias: ToolCallState

```ts
type ToolCallState = 
  | "awaiting-input"
  | "input-streaming"
  | "input-complete"
  | "approval-requested"
  | "approval-responded"
  | "complete"
  | "error";
```

Defined in: [packages/ai/src/types.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L47)

Tool call states - track the lifecycle of a tool call
