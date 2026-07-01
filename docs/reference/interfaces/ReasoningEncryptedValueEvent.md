---
id: ReasoningEncryptedValueEvent
title: ReasoningEncryptedValueEvent
---

# Interface: ReasoningEncryptedValueEvent

Defined in: [packages/ai/src/types.ts:1465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1465)

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

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

Model identifier for multi-model support
