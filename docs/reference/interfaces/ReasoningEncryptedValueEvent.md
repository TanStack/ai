---
id: ReasoningEncryptedValueEvent
title: ReasoningEncryptedValueEvent
---

# Interface: ReasoningEncryptedValueEvent

Defined in: [packages/typescript/ai/src/types.ts:1125](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1125)

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

Defined in: [packages/typescript/ai/src/types.ts:1127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1127)

Model identifier for multi-model support
