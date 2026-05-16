---
id: ReasoningEncryptedValueEvent
title: ReasoningEncryptedValueEvent
---

# Interface: ReasoningEncryptedValueEvent

Defined in: [packages/typescript/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1256)

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

Defined in: [packages/typescript/ai/src/types.ts:1258](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1258)

Model identifier for multi-model support
