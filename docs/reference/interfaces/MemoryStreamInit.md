---
id: MemoryStreamInit
title: MemoryStreamInit
---

# Interface: MemoryStreamInit

Defined in: [packages/ai/src/stream-durability.ts:308](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L308)

Explicit construction for [memoryStream](../functions/memoryStream.md), for callers that don't have
the incoming `Request` — e.g. a TanStack Start server function implementing
a `joinRun` replay for a run id it received as call data:

```ts
const durability = memoryStream({ runId })
for await (const chunk of replayRunStream(durability)) yield chunk
```

## Properties

### offset?

```ts
optional offset?: string | null;
```

Defined in: [packages/ai/src/stream-durability.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L315)

Resume offset captured by the consumer (`resumeFrom()` returns it).
Defaults to `null` (a producer / from-start reader).

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/stream-durability.ts:310](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L310)

The run this durability adapter attaches to.
