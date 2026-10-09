---
id: ConstrainedModelMessage
title: ConstrainedModelMessage
---

```ts
type ConstrainedModelMessage<TInputModalitiesTypes> = Omit<ModelMessage, "content"> & object;
```

Defined in: [packages/ai/src/types.ts:709](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L709)

A ModelMessage with content constrained to only allow content parts
matching the specified input modalities.

## Type Declaration

### content

```ts
content: ConstrainedContent<TInputModalitiesTypes>;
```

## Type Parameters

### TInputModalitiesTypes

`TInputModalitiesTypes` *extends* [`InputModalitiesTypes`](InputModalitiesTypes.md)
