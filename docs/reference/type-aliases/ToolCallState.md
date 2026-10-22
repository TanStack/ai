---
id: ToolCallState
title: ToolCallState
---

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

Defined in: packages/ai/src/types.ts:88

Tool call states - track the lifecycle of a tool call
