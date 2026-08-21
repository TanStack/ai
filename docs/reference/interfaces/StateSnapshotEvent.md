---
id: StateSnapshotEvent
title: StateSnapshotEvent
---

# Interface: StateSnapshotEvent

Defined in: [packages/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1385)

Emitted to provide a full state snapshot.

@ag-ui/core provides: `snapshot` (any)
TanStack AI adds: `model?`, `state?` (deprecated alias for snapshot)

## Extends

- `StateSnapshotEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1387](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1387)

Model identifier for multi-model support

***

### ~~state?~~

```ts
optional state?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1392](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1392)

#### Deprecated

Use `snapshot` instead (from @ag-ui/core spec).
Kept for backward compatibility.
