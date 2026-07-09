---
id: LocksCapability
title: LocksCapability
---

# Variable: LocksCapability

```ts
const LocksCapability: Capability<LockStore, "locks">;
```

Defined in: [packages/ai/src/locks.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/locks.ts#L29)

The lock capability. PROVIDED by `withChatPersistence` (durable) and OPTIONALLY
required by `withSandbox`. Falls back to [InMemoryLockStore](../classes/InMemoryLockStore.md) when no
middleware provides it.
