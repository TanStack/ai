---
id: UnopenedInterruptBinding
title: UnopenedInterruptBinding
---

# Type Alias: UnopenedInterruptBinding

```ts
type UnopenedInterruptBinding = InterruptBinding extends infer TBinding ? TBinding extends InterruptBinding ? Omit<TBinding, "interruptedRunId" | "generation"> : never : never;
```

Defined in: [packages/ai/src/interrupts.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L120)
