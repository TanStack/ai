---
id: BatchInterruptErrorCode
title: BatchInterruptErrorCode
---

# Type Alias: BatchInterruptErrorCode

```ts
type BatchInterruptErrorCode = 
  | "incomplete-batch"
  | "item-validation-failed"
  | "unsupported-bulk-operation"
  | "async-resolver"
  | "inactive-transaction"
  | "mixed-provenance"
  | "transport"
  | "server"
  | "protocol"
  | "invalid-response-schema"
  | "expired"
  | "stale"
  | "conflict"
  | "legacy-submit-failed";
```

Defined in: [packages/ai/src/interrupts.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L27)
