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

Defined in: [packages/typescript/ai/src/types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L36)

Tool call states - track the lifecycle of a tool call
