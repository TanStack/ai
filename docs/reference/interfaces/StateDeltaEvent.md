---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [packages/ai/src/types.ts:1203](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1203)

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
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1205](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1205)

Model identifier for multi-model support
