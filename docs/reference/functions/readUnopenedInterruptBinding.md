---
id: readUnopenedInterruptBinding
title: readUnopenedInterruptBinding
---

# Function: readUnopenedInterruptBinding()

```ts
function readUnopenedInterruptBinding(descriptor): 
  | Omit<ResponseSchemaInterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<ResponseSchemaInterruptBindingBase & object, "interruptedRunId" | "generation">
  | Omit<InterruptBindingBase & object, "interruptedRunId" | "generation">
  | undefined;
```

Defined in: [packages/ai/src/interrupt-resume.ts:804](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L804)

## Parameters

### descriptor

`Interrupt`

## Returns

  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `undefined`
