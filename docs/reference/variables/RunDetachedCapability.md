---
id: RunDetachedCapability
title: RunDetachedCapability
---

# Variable: RunDetachedCapability

```ts
const RunDetachedCapability: Capability<true, "run-detached">;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:329](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L329)

Whether this run's teardown DID detach — the disconnect was survived, the
agent is still working, and a later attach can take the run over.

The past-tense counterpart of [DetachableRunCapability](DetachableRunCapability.md), and the two must
not be confused:

- **detachABLE** is published at `setup`, and only says a disconnect *may* be
  survived (a `RunStore` and a durable log are wired).
- **detachED** is published on the ABORT path, by the middleware that actually
  makes the call — `withSandbox`'s `onAbort`, which is the only actor that has
  resolved BOTH out-of-band cancel bands (`AbortInfo.cancelRequested` and
  `wasCancelRequested` on the record) and `detachOnDisconnect`. An explicit
  cancel, a non-detachable disconnect, an error, and a normal finish all leave
  it unpublished.

Its consumer is the durable DELIVERY sink in `stream-to-response.ts`: a
detached run's log must stay OPEN and un-terminalized so the takeover can
continue it (see `wasRunDetached` in `../../../delivery-detach`). Reading it
is safe and race-free only because a `for await` over the chat stream awaits
the generator's `return()` — and therefore the whole `onAbort` chain — before
the sink's own `finally` runs.

Read with `{ optional: true }`: absent means "not detached", which is every
other exit path and every app that has not wired durability.

Typed `true`, not `boolean`, for the same reason as
[DetachableRunCapability](DetachableRunCapability.md): absence is the only negative, so publishing
`false` must not be representable.
