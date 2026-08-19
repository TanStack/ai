---
id: INTERRUPT_BINDING_VERSION
title: INTERRUPT_BINDING_VERSION
---

# Variable: INTERRUPT\_BINDING\_VERSION

```ts
const INTERRUPT_BINDING_VERSION: 1;
```

Defined in: [packages/ai/src/interrupts.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L79)

Wire version of [InterruptBinding](../type-aliases/InterruptBinding.md).

The binding is the only part of an AG-UI `Interrupt` that this package
claims — it rides in `metadata` under
[INTERRUPT\_BINDING\_METADATA\_KEY](INTERRUPT_BINDING_METADATA_KEY.md) and tells the resume path how to
correlate an answer back to a paused run. Producers stamp `v`; readers
reject any version they don't understand rather than duck-typing the fields.

That matters because an AG-UI `Interrupt` is a shared envelope. Another
producer — a workflow engine projecting a durable approval, a third-party
agent — can legitimately put its own binding in the same envelope. Versioning
makes "not mine" a clean rejection instead of a partial match that resumes
against the wrong owner.
