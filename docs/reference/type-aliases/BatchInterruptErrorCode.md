---
id: BatchInterruptErrorCode
title: BatchInterruptErrorCode
---

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
  | "conflict";
```

Defined in: packages/ai/src/interrupts.ts:26
