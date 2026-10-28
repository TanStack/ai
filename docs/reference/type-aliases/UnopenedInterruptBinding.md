---
id: UnopenedInterruptBinding
title: UnopenedInterruptBinding
---

```ts
type UnopenedInterruptBinding = InterruptBinding extends infer TBinding ? TBinding extends InterruptBinding ? Omit<TBinding, "interruptedRunId" | "generation"> : never : never;
```

Defined in: packages/ai/src/interrupts.ts:118
