---
id: encodeOffset
title: encodeOffset
---

# Function: encodeOffset()

```ts
function encodeOffset(runId, seq): string;
```

Defined in: [packages/ai/src/stream-durability.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L78)

Encode a durability offset. The format is `runId@seq`; the seq may be a
1-based sequence number, or the sentinel `-1` (from start) / `now` (tail).

## Parameters

### runId

`string`

### seq

`number` | `"now"`

## Returns

`string`
