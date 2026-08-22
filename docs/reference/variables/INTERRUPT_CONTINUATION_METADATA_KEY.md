---
id: INTERRUPT_CONTINUATION_METADATA_KEY
title: INTERRUPT_CONTINUATION_METADATA_KEY
---

# Variable: INTERRUPT\_CONTINUATION\_METADATA\_KEY

```ts
const INTERRUPT_CONTINUATION_METADATA_KEY: "tanstack:interruptContinuation";
```

Defined in: [packages/ai/src/generic-interrupt-continuation.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/generic-interrupt-continuation.ts#L11)

`ResumeEntry.metadata` key for a first-party generic request.

AG-UI `resume` only carries the answer (`interruptId`, `status`, `payload`).
The original request rides here so an ephemeral server can rebuild it.
