---
id: withInterruptBinding
title: withInterruptBinding
---

# Function: withInterruptBinding()

```ts
function withInterruptBinding(descriptor, binding): Interrupt;
```

Defined in: [packages/ai/src/interrupt-resume.ts:902](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L902)

Attach a resume binding to an interrupt descriptor, under
[INTERRUPT\_BINDING\_METADATA\_KEY](../variables/INTERRUPT_BINDING_METADATA_KEY.md).

This is the supported way to make an interrupt resumable by this package.
The descriptor keeps its AG-UI shape; only `metadata` gains the namespaced
key. Pass the unopened form (no `interruptedRunId` / `generation`) when
emitting from inside a run — those fields are stamped as the run finishes.

## Parameters

### descriptor

`Interrupt`

### binding

  \| [`InterruptBinding`](../type-aliases/InterruptBinding.md)
  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`ResponseSchemaInterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>
  \| `Omit`\<`InterruptBindingBase` & `object`, `"interruptedRunId"` \| `"generation"`\>

## Returns

`Interrupt`
