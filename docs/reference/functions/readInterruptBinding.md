---
id: readInterruptBinding
title: readInterruptBinding
---

# Function: readInterruptBinding()

```ts
function readInterruptBinding(descriptor): InterruptBinding | undefined;
```

Defined in: [packages/ai/src/interrupt-resume.ts:927](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L927)

Read the opened resume binding off a descriptor, or `undefined` when the
descriptor carries no binding of a version we understand.

`undefined` means "this interrupt is not ours to resume" — it is not a
failure to recover from by inventing a binding.

## Parameters

### descriptor

`Interrupt`

## Returns

[`InterruptBinding`](../type-aliases/InterruptBinding.md) \| `undefined`
