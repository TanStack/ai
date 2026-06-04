---
id: StateSnapshotEvent
title: StateSnapshotEvent
---

# Interface: StateSnapshotEvent

Defined in: [packages/ai/src/types.ts:1180](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1180)

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
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1182)

Model identifier for multi-model support

***

### ~~state?~~

```ts
optional state: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1187)

#### Deprecated

Use `snapshot` instead (from @ag-ui/core spec).
Kept for backward compatibility.
