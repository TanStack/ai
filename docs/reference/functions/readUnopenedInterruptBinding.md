---
id: readUnopenedInterruptBinding
title: readUnopenedInterruptBinding
---

```ts
function readUnopenedInterruptBinding(descriptor): 
  | Omit<ResponseSchemaInterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<ResponseSchemaInterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<InterruptBindingBase & object, "interruptedRunId" | "generation">
  | undefined;
```

Defined in: packages/ai/src/interrupt-resume.ts:856

## Parameters

### descriptor

`Interrupt`

## Returns

  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `undefined`
