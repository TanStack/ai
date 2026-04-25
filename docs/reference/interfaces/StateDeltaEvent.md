---
id: StateDeltaEvent
title: StateDeltaEvent
---

# Interface: StateDeltaEvent

Defined in: [packages/typescript/ai/src/types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

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

Defined in: [packages/typescript/ai/src/types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

Model identifier for multi-model support
