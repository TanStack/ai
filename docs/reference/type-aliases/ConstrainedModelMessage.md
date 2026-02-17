---
id: ConstrainedModelMessage
title: ConstrainedModelMessage
---

# Type Alias: ConstrainedModelMessage\<TInputModalitiesTypes\>

```ts
type ConstrainedModelMessage<TInputModalitiesTypes> = Omit<ModelMessage, "content"> & object;
```

Defined in: [types.ts:341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L341)

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
