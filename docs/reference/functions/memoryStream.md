---
id: memoryStream
title: memoryStream
---

# Function: memoryStream()

```ts
function memoryStream(source, options?): UpsertableStreamDurability;
```

Defined in: [packages/ai/src/stream-durability.ts:331](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L331)

The zero-infrastructure delivery-durability backend. Its versioned cursor is
deliberately private: callers and core only pass the returned string back.

Construct from the incoming `Request` (HTTP transports) or from an explicit
[MemoryStreamInit](../interfaces/MemoryStreamInit.md) (server functions / direct calls that already know
the run id).

Logs live in a process-global map, so this backend is for development, tests,
and single-process deployments only. Completed runs are evicted after a grace
window (see COMPLETED\_LOG\_TTL\_MS); a resume of an evicted or unknown
run fails loudly rather than hanging.

## Parameters

### source

`Request` \| [`MemoryStreamInit`](../interfaces/MemoryStreamInit.md)

### options?

[`MemoryStreamOptions`](../interfaces/MemoryStreamOptions.md) = `{}`

## Returns

[`UpsertableStreamDurability`](../interfaces/UpsertableStreamDurability.md)
