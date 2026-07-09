---
id: decodeOffset
title: decodeOffset
---

# Function: decodeOffset()

```ts
function decodeOffset(offset): object;
```

Defined in: [packages/ai/src/stream-durability.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L125)

Decode a `runId@seq` offset. Splits on the LAST `@` so run ids that
themselves contain `@` round-trip. The seq is parsed via the shared sentinel
logic, so `runId@now` (→ `+Infinity`) and `runId@-1` (→ `-1`) decode without
throwing; only a missing `@` or a non-sentinel non-numeric seq throws.

## Parameters

### offset

`string`

## Returns

`object`

### runId

```ts
runId: string;
```

### seq

```ts
seq: number;
```
