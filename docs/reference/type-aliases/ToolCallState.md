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

Defined in: [stream/types.ts:13](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L13)

Tool call states - track the lifecycle of a tool call
