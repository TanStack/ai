---
id: StateSnapshotEvent
title: StateSnapshotEvent
---

# Interface: StateSnapshotEvent

Defined in: [packages/typescript/ai/src/types.ts:1015](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1015)

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

Defined in: [packages/typescript/ai/src/types.ts:1017](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1017)

Model identifier for multi-model support

***

### ~~state?~~

```ts
optional state: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:1022](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1022)

#### Deprecated

Use `snapshot` instead (from @ag-ui/core spec).
Kept for backward compatibility.
