---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [packages/typescript/ai/src/types.ts:1044](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1044)

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

Defined in: [packages/typescript/ai/src/types.ts:1046](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1046)

Model identifier for multi-model support
