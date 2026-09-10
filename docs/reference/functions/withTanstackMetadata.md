---
id: withTanstackMetadata
title: withTanstackMetadata
---

# Function: withTanstackMetadata()

```ts
function withTanstackMetadata<T>(value, tanstack): Omit<T, "metadata"> & object;
```

Defined in: [packages/ai/src/utilities/merge-metadata.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/merge-metadata.ts#L46)

## Type Parameters

### T

`T`

## Parameters

### value

`T` & `object`

### tanstack

`MetadataRecord`

## Returns

`Omit`\<`T`, `"metadata"`\> & `object`
