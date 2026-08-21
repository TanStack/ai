---
id: ConstrainedModelMessage
title: ConstrainedModelMessage
---

# Type Alias: ConstrainedModelMessage\<TInputModalitiesTypes\>

```ts
type ConstrainedModelMessage<TInputModalitiesTypes> = Omit<ModelMessage, "content"> & object;
```

Defined in: [packages/ai/src/types.ts:530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L530)

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
