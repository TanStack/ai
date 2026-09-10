---
id: MemoryStreamOptions
title: MemoryStreamOptions
---

# Interface: MemoryStreamOptions

Defined in: [packages/ai/src/stream-durability.ts:242](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L242)

Options for the in-process delivery-durability backend.

## Properties

### firstChunkDeadlineMs?

```ts
optional firstChunkDeadlineMs?: number;
```

Defined in: [packages/ai/src/stream-durability.ts:248](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L248)

Milliseconds a from-start join waits for the run's first chunk before
throwing. Defaults to DEFAULT\_FIRST\_CHUNK\_DEADLINE\_MS (100ms) —
raise it if a producer can legitimately start long after a joiner attaches.
