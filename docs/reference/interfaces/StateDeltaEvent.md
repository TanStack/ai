---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [packages/ai/src/types.ts:1389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1389)

Emitted to provide an incremental state update.

@ag-ui/core provides: `delta` (any[] - JSON Patch RFC 6902)
TanStack AI adds: `model?`

## Extends

- `StateDeltaEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1391)

Model identifier for multi-model support
