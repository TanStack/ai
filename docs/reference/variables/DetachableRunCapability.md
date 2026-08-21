---
id: DetachableRunCapability
title: DetachableRunCapability
---

# Variable: DetachableRunCapability

```ts
const DetachableRunCapability: Capability<true, "detachable-run">;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L290)

Whether the current run can be DETACHED rather than destroyed when its client
disconnects — `true` only when some middleware has both a [RunStore](../interfaces/RunStore.md) and
a durable event log wired (`withSandbox`'s `runs` + `durability.adapter`).

Lives in core for the same reason `LockStore` does: it is a coordination fact
that two consumer packages must agree on, and neither may depend on the other.
`@tanstack/ai-sandbox` provides it; `@tanstack/ai-persistence` reads it to
decide whether an abort is terminal (`'aborted'`) or a detach (write nothing).
A persistence → sandbox import would be a layering inversion.

Consumers read it with `{ optional: true }`: absent means "not detachable",
which is every app that has not wired durability.

Typed `true`, not `boolean`: ABSENCE is the negative, so a published `false`
has no meaning — and a consumer that tests PRESENCE rather than the value
would read one as "detachable". Narrowing the payload makes that
unrepresentable instead of merely undocumented.
