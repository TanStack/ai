---
id: ToolApprovalResolution
title: ToolApprovalResolution
---

# Type Alias: ToolApprovalResolution

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

Defined in: [packages/ai/src/interrupts.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L126)
