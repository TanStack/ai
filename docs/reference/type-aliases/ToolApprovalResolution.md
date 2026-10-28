---
id: ToolApprovalResolution
title: ToolApprovalResolution
---

```ts
type ToolApprovalResolution = 
  | boolean
  | {
  approved: true;
  editedArgs?: unknown;
  payload?: unknown;
}
  | {
  approved: false;
  editedArgs?: never;
  payload?: unknown;
};
```

Defined in: packages/ai/src/interrupts.ts:124
