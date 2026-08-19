---
id: INTERRUPT_BINDING_METADATA_KEY
title: INTERRUPT_BINDING_METADATA_KEY
---

# Variable: INTERRUPT\_BINDING\_METADATA\_KEY

```ts
const INTERRUPT_BINDING_METADATA_KEY: "tanstack:interruptBinding" = 'tanstack:interruptBinding';
```

Defined in: [packages/ai/src/interrupt-resume.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L40)

The `Interrupt.metadata` key under which this package's resume binding
travels.

Exported so anything that produces an interrupt this package must later
resume — an application middleware raising a generic pause, a future
workflow-to-AG-UI projection — attaches the binding through
[withInterruptBinding](../functions/withInterruptBinding.md) rather than copying the string. Everything
outside this key is the plain AG-UI envelope and is left untouched.
