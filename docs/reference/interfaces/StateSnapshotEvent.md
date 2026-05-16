---
id: StateSnapshotEvent
title: StateSnapshotEvent
---

# Interface: StateSnapshotEvent

Defined in: [packages/typescript/ai/src/types.ts:1059](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1059)

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

Defined in: [packages/typescript/ai/src/types.ts:1061](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1061)

Model identifier for multi-model support

***

### ~~state?~~

```ts
optional state: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:1066](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1066)

#### Deprecated

Use `snapshot` instead (from @ag-ui/core spec).
Kept for backward compatibility.
