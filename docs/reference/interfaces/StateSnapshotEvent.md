---
id: StateSnapshotEvent
title: StateSnapshotEvent
---

# Interface: StateSnapshotEvent

Defined in: [packages/typescript/ai/src/types.ts:1119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1119)

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

Defined in: [packages/typescript/ai/src/types.ts:1121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1121)

Model identifier for multi-model support

***

### ~~state?~~

```ts
optional state: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/types.ts:1126](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1126)

#### Deprecated

Use `snapshot` instead (from @ag-ui/core spec).
Kept for backward compatibility.
