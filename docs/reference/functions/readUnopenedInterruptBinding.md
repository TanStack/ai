---
id: readUnopenedInterruptBinding
title: readUnopenedInterruptBinding
---

# Function: readUnopenedInterruptBinding()

```ts
function readUnopenedInterruptBinding(descriptor): 
  | Omit<InterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<InterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<InterruptBindingBase & object, "interruptedRunId" | "generation">
  | undefined;
```

Defined in: [packages/ai/src/interrupt-resume.ts:700](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L700)

## Parameters

### descriptor

`Interrupt`

## Returns

  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `undefined`
