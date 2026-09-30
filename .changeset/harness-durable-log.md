---
'@tanstack/ai-persistence': minor
'@tanstack/ai-harness': minor
---

Add a durable session log. A harness session can now keep its events, transcript, inputs, and tool steps in one append-only log, so a turn survives a crash, a retry does not run an input twice, and a tool does not repeat a finished side effect.

`@tanstack/ai-persistence` adds the `LogStore` contract: `append` writes a batch at a position, all or nothing, and rejects with `LogConflictError` when another writer took that position. `read` and `subscribe` complete it. Put your store in `stores.log`. `defineLogStore` types an adapter, `memoryLogStore()` is the reference store, and `runPersistenceConformance` runs the log cases when `stores.log` is present.

`@tanstack/ai-harness` turns on durable mode when the host gets `stores.log` and `stores.runs`:

- `prompt`, `steer`, `followUp`, and `resolve` take an optional `inputId`, and so do `prompt`, `steer`, and `followUp` of `createHarnessClient`. The same id with the same payload does not run again. `Operation.receipt` resolves when the input is stored, and `session.settled(inputId)` gives how an input ended, also after a restart.
- `defineHarness({ durability: { maxAttempts, timeoutMs } })` limits each input. The default is 10 attempts and no timeout.
- `durableTool(definition, execute)` gives a tool `step.do(name, fn)`. After a crash, a finished step returns its stored value and does not run again. The tool's `append(records)` adds host records to the same append as the tool batch.
- `session.append(records)` adds host records to the log. The host option `project: { record, version }` folds host records into the model context. `logMessageStore` reads the transcript of a log outside a session.
- Host options `coalesceMs` (default 100 ms in durable mode) and `lease: { ttlMs, renewMs }`. Clients get a `harness.input.settled` event when an input ends.
- A `busy: 'steer'` prompt joins the running turn in the order it arrived, and it settles with that turn.

Breaking changes in the harness:

- `HarnessPersistence` is now a union of the current stores and the log stores.
- After a crash, the note for a tool that may have run now sets `error`, so the model sees a tool error.
- A steer that a turn did not reach is now answered in the same turn, not in a new turn.
