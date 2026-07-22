---
'@tanstack/ai-client': minor
'@tanstack/ai': minor
---

Make interrupt ownership explicit rather than assumed.

An AG-UI `Interrupt` is a shared envelope — a workflow engine's durable
approval or another agent framework's pause can arrive on the same stream. What
makes a pause resumable through `chat()` is the binding this package attaches
under `tanstack:interruptBinding`.

- Interrupts that carry no binding this client understands now surface as
  `kind: 'unbound'` with `canResolve: false`, instead of being given a
  synthesized binding and rendered as resolvable generic interrupts. Resolving
  those produced an answer submitted against a run with nothing pending, which
  failed as `unknown-interrupt` only after the user had filled in the form.
  Unbound items never block submission of the interrupts that are yours.
- The binding carries a wire version (`INTERRUPT_BINDING_VERSION`). Readers
  reject a version they don't recognise rather than duck-typing its fields. A
  binding written before the field existed is still read.
- `INTERRUPT_BINDING_METADATA_KEY`, `withInterruptBinding()` and
  `readInterruptBinding()` are exported, so anything producing an interrupt this
  package must later resume attaches the binding through a supported API
  instead of copying the metadata key.
- Interrupt classification is driven by the binding alone. `Interrupt.reason` is
  free-form AG-UI text another producer can also use, so it is now a display
  hint only and never decides ownership.
- The interrupt protocol surface is enumerated instead of `export *`. The
  unimplemented durable-recovery contract (`InterruptRecoveryStateV1`,
  `InterruptRecoveryQuery`, the never-called `loadInterruptState` adapter hook,
  and the `persistence-required` / `atomic-commit-unsupported` /
  `recovery-unavailable` error codes) is removed rather than published.
