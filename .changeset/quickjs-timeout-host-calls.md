---
'@tanstack/ai-isolate-quickjs': patch
---

Enforce `timeout` as a wall-clock deadline that covers host-call suspensions.

Previously the only deadline mechanism was QuickJS's `setInterruptHandler`, which
fires only while the sandbox is stepping bytecode. While the isolate is
asyncify-suspended awaiting a host binding's Promise, no interrupt fires, so the
configured `timeout` was silently ignored: a run with `timeout: 100` and an
800 ms host binding resolved successfully after ~800 ms, and a hung host binding
could hang `execute()` indefinitely.

`execute()` now races the run against a wall-clock timer, so `timeout` bounds the
entire execution including time spent suspended in a host call. On the deadline
it returns a normalized `TimeoutError` immediately. The suspended host Promise
cannot be cancelled and the VM cannot be freed mid-asyncify, so disposal and the
internal execution-queue turn are deferred until the orphaned run unwinds (the
still-armed interrupt handler aborts it the moment the host Promise settles),
which prevents a late host result from resuming a dead execution and avoids
leaking the context. CPU-bound loops are still interrupted as before and leave
the context reusable. The public API is unchanged.
