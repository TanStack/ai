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
  | "approval-responded";
```

Defined in: [types.ts:6](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L6)

Tool call states - track the lifecycle of a tool call
