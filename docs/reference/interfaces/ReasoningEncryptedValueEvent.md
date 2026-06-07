---
id: ReasoningEncryptedValueEvent
title: ReasoningEncryptedValueEvent
---

# Interface: ReasoningEncryptedValueEvent

Defined in: [packages/ai/src/types.ts:1391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1391)

Emitted for encrypted reasoning values.

@ag-ui/core provides: `subtype`, `entityId`, `encryptedValue`
TanStack AI adds: `model?`

## Extends

- `ReasoningEncryptedValueEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1393)

Model identifier for multi-model support
